// ServiCore — WhatsApp Send Edge Function
// Deploy to Supabase: supabase functions deploy send-whatsapp

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID")!;

Deno.serve(async (req) => {
  // Only allow from pg_net (internal) or authenticated admin
  const auth = req.headers.get("Authorization");
  const isServiceRole = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

  if (!isServiceRole) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { to, message, reminder_id } = await req.json();

  if (!to || !message) {
    return new Response(JSON.stringify({ error: "Missing 'to' or 'message'" }), { status: 400 });
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: { body: message },
        }),
      }
    );

    const data = await res.json();

    if (data.messages?.[0]?.id) {
      // Update reminder record
      if (reminder_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        await fetch(`${supabaseUrl}/rest/v1/reminders?id=eq.${reminder_id}`, {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            status: "sent",
            whatsapp_sent: true,
            whatsapp_message_id: data.messages[0].id,
          }),
        });
      }
      return new Response(JSON.stringify({ success: true, id: data.messages[0].id }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: false, error: data }), { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
});
