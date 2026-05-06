// ServiCore — QR Check-In Edge Function
// Deploy: supabase functions deploy qr-checkin
// Accepts public check-ins from technician QR scans
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      qr_uuid,
      tech_name,
      tech_phone,
      work_type,
      description,
      equipment_ids,
      photos,          // array of { filename, base64 } or single photo base64 string
      parts_used,
      hours_spent,
      signature,       // base64 png
      gps_latitude,
      gps_longitude,
    } = body;

    // --- Validate ---
    if (!qr_uuid) throw new Error("Missing qr_uuid");
    if (!tech_name) throw new Error("Missing tech_name");
    if (!description) throw new Error("Missing description");

    // --- Look up client by QR UUID ---
    const clientRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_client_by_qr`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
        },
        body: JSON.stringify({ qr_uuid_in: qr_uuid }),
      }
    );

    if (!clientRes.ok) throw new Error("Invalid QR code or client not found");

    const clients = await clientRes.json();
    if (!clients || clients.length === 0) throw new Error("Client not found for this QR code");
    const client = clients[0];

    // --- Upload photos to storage ---
    const photoUrls: string[] = [];
    const photosToProcess = Array.isArray(photos) ? photos : photos ? [{ data: photos }] : [];

    for (let i = 0; i < photosToProcess.length; i++) {
      const photo = photosToProcess[i];
      const base64Data = typeof photo === "string" ? photo : photo.data || photo.base64;
      if (!base64Data) continue;

      // Strip data URL prefix if present
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
      const binaryData = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));

      const ext = base64Data.startsWith("data:image/png") ? "png" : "jpg";
      const filename = typeof photo === "object" && photo.filename
        ? photo.filename
        : `qr-${Date.now()}-${i}.${ext}`;

      const path = `qr-checkins/${client.id}/${filename}`;

      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${path}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": `image/${ext}`,
            "x-upsert": "true",
          },
          body: binaryData,
        }
      );

      if (uploadRes.ok) {
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/service-photos/${path}`;
        photoUrls.push(publicUrl);
      }
    }

    // --- Process signature ---
    let signatureUrl: string | null = null;
    if (signature) {
      const cleanSig = signature.replace(/^data:image\/\w+;base64,/, "");
      const sigBinary = Uint8Array.from(atob(cleanSig), (c) => c.charCodeAt(0));
      const sigPath = `qr-checkins/${client.id}/sig-${Date.now()}.png`;

      const sigRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${sigPath}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": "image/png",
            "x-upsert": "true",
          },
          body: sigBinary,
        }
      );

      if (sigRes.ok) {
        signatureUrl = `${SUPABASE_URL}/storage/v1/object/public/service-photos/${sigPath}`;
      }
    }

    // --- Create service visit ---
    const visitRes = await fetch(
      `${SUPABASE_URL}/rest/v1/service_visits`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
          "Prefer": "return=representation",
        },
        body: JSON.stringify({
          client_id: client.id,
          equipment_id: equipment_ids?.[0] || null,
          scheduled_date: new Date().toISOString().split("T")[0],
          completed_date: new Date().toISOString().split("T")[0],
          status: "completed",
          notes: description,
          work_type: work_type || "maintenance",
          parts_used: parts_used || null,
          hours_spent: hours_spent || null,
          signature_data: signatureUrl,
          tech_name: tech_name,
          tech_phone: tech_phone || null,
          checkin_source: "qr",
          photo_url: photoUrls[0] || null,
          gps_latitude: gps_latitude || null,
          gps_longitude: gps_longitude || null,
        }),
      }
    );

    if (!visitRes.ok) {
      const errText = await visitRes.text();
      throw new Error(`Failed to create visit: ${errText}`);
    }

    const visit = await visitRes.json();
    const visitId = Array.isArray(visit) ? visit[0]?.id : visit.id;

    // --- Create service_photos entries for each uploaded photo ---
    for (const url of photoUrls) {
      await fetch(`${SUPABASE_URL}/rest/v1/service_photos`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          "apikey": SERVICE_KEY,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          visit_id: visitId,
          photo_url: url,
          gps_latitude: gps_latitude || null,
          gps_longitude: gps_longitude || null,
          timestamp: new Date().toISOString(),
        }),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        visit_id: visitId,
        client_name: client.name,
        client_branch: client.branch,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
