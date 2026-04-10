import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { event, data } = await req.json();

    if (!event || !data) {
      return new Response(
        JSON.stringify({ error: "event and data are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-generic-webhook] Processing event: ${event}`);

    // Check if webhooks are enabled
    const { data: enabledSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "webhooks.enabled")
      .maybeSingle();

    const { data: urlSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "webhooks.booking_created_url")
      .maybeSingle();

    const webhooksEnabled = enabledSetting?.value === "true" || enabledSetting?.value === true;
    const webhookUrl = typeof urlSetting?.value === "string" ? urlSetting.value : null;

    if (!webhooksEnabled || !webhookUrl) {
      console.log("[send-generic-webhook] Webhooks disabled or no URL configured, skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "webhooks_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build payload
    const payload = {
      event,
      environment: "production",
      source: "admin_panel",
      timestamp: new Date().toISOString(),
      ...data,
    };

    console.log("[send-generic-webhook] Sending payload:", JSON.stringify(payload, null, 2));

    // Send webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseStatus = webhookResponse.status;
    const responseText = await webhookResponse.text();
    console.log(`[send-generic-webhook] Response: ${responseStatus} - ${responseText}`);

    // Log to outbound_webhooks
    await supabase.from("outbound_webhooks").insert({
      event,
      payload,
      status: responseStatus >= 200 && responseStatus < 300 ? "sent" : "failed",
      sent_at: new Date().toISOString(),
      last_error: responseStatus >= 200 && responseStatus < 300 ? null : `HTTP ${responseStatus}: ${responseText}`,
    });

    return new Response(
      JSON.stringify({ success: responseStatus >= 200 && responseStatus < 300, event, webhook_status: responseStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-generic-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
