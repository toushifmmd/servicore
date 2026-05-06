// ServiCore — WhatsApp Webhook Handler
// Receives message status updates from Meta WhatsApp

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  const body = await req.json();

  // Verify webhook (Meta sends a GET with hub.challenge)
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("hub.verify_token")) {
    const verifyToken = url.searchParams.get("hub.verify_token");
    const expectedToken = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") || "servicore-webhook";
    if (verifyToken === expectedToken) {
      return new Response(url.searchParams.get("hub.challenge") || "", {
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Invalid token", { status: 403 });
  }

  // Process incoming message status updates
  if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
    const statuses = body.entry[0].changes[0].value.statuses;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const s of statuses) {
      if (s.status === "failed" && s.id) {
        await fetch(`${supabaseUrl}/rest/v1/reminders?whatsapp_message_id=eq.${s.id}`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({ status: "failed" }),
        });
      }
    }
  }

  return new Response("OK", { status: 200 });
});
