import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BookingWebhookPayload {
  event: string;
  environment: string;
  source: string;
  timestamp: string;
  booking: {
    id: string;
    type: string;
    origin: string;
    start_at: string;
    end_at: string;
    status: string;
    payment_method: string;
    payment_status: string;
    notes: any;
    created_at: string;
  };
  service?: {
    id: string;
    name: string;
    price: number;
    duration_min: number;
    currency: string;
    category_name?: string;
  };
  class?: {
    id: string;
    name: string;
    capacity: number;
    price: number;
    currency: string;
  };
  professional: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  location: {
    id: string;
    name: string;
    address: string | null;
    timezone: string | null;
  };
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    app_user_id: string;
  };
  voucher?: {
    id: string;
    code: string | null;
    type_name: string;
    sessions_remaining: number;
  };
  subscription?: {
    id: string;
    plan_name: string;
    status: string;
  };
  // New fields for cancellation and modification events
  previous_data?: {
    start_at: string;
    end_at: string;
  };
  cancellation_reason?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get parameters from request body
    // event defaults to 'booking.created' for retrocompatibility with existing trigger
    const { 
      booking_id, 
      event = "booking.created",
      previous_start_at,
      previous_end_at
    } = await req.json();
    
    if (!booking_id) {
      console.error("No booking_id provided");
      return new Response(
        JSON.stringify({ error: "booking_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing webhook for booking: ${booking_id}, event: ${event}`);

    // Check if webhooks are enabled - fetch both settings separately
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
      console.log("Webhooks disabled or no URL configured, skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "webhooks_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch complete booking data with all relations
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        service:services(id, name, price, duration_min, currency, category:categories(name)),
        class:classes(id, name, capacity, price, currency),
        professional:professionals(id, name, email, phone),
        location:locations(id, name, address, timezone),
        customer:users_shadow(id, name, email, phone, app_user_id)
      `)
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      console.error("Error fetching booking:", bookingError);
      return new Response(
        JSON.stringify({ error: "Booking not found", details: bookingError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch voucher data if origin is 'voucher'
    let voucherData = null;
    if (booking.origin === "voucher") {
      // Parse notes to get voucher info
      let notesData: any = {};
      try {
        notesData = typeof booking.notes === "string" ? JSON.parse(booking.notes) : booking.notes || {};
      } catch (e) {
        console.log("Could not parse notes:", e);
      }

      if (notesData.voucherId) {
        const { data: voucher } = await supabase
          .from("vouchers")
          .select(`
            id, code, sessions_remaining,
            voucher_type:voucher_types(name)
          `)
          .eq("id", notesData.voucherId)
          .single();

        if (voucher) {
          voucherData = {
            id: voucher.id,
            code: voucher.code,
            type_name: voucher.voucher_type?.name || "Unknown",
            sessions_remaining: voucher.sessions_remaining,
          };
        }
      }
    }

    // Fetch subscription data if origin is 'subscription'
    let subscriptionData = null;
    if (booking.origin === "subscription") {
      let notesData: any = {};
      try {
        notesData = typeof booking.notes === "string" ? JSON.parse(booking.notes) : booking.notes || {};
      } catch (e) {
        console.log("Could not parse notes:", e);
      }

      if (notesData.subscriptionId) {
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select(`
            id, status,
            plan:subscription_plans(name)
          `)
          .eq("id", notesData.subscriptionId)
          .single();

        if (subscription) {
          subscriptionData = {
            id: subscription.id,
            plan_name: subscription.plan?.name || "Unknown",
            status: subscription.status,
          };
        }
      }
    }

    // Extract cancellation reason from notes for cancelled bookings
    let cancellationReason: string | undefined;
    if (event === "booking.cancelled") {
      const rawNotes = typeof booking.notes === "string" ? booking.notes : JSON.stringify(booking.notes || "");
      
      // Try JSON parse first
      try {
        const notesData = JSON.parse(rawNotes);
        cancellationReason = notesData.cancellationReason || notesData.cancelReason || undefined;
      } catch (_e) {
        // Not valid JSON — expected when notes have appended plain text
      }

      // Fallback: extract from plain text patterns like "Cancelado por admin: reason" or "Cancelado: reason"
      if (!cancellationReason) {
        const patterns = [
          /Cancelado por admin:\s*(.+)/i,
          /Cancelado:\s*(.+)/i,
          /Motivo:\s*(.+)/i,
        ];
        for (const pattern of patterns) {
          const match = rawNotes.match(pattern);
          if (match?.[1]) {
            cancellationReason = match[1].trim();
            break;
          }
        }
      }

      console.log("Extracted cancellation reason:", cancellationReason);
    }

    // Build the webhook payload
    const payload: BookingWebhookPayload = {
      event: event,
      environment: "production",
      source: "database_trigger",
      timestamp: new Date().toISOString(),
      booking: {
        id: booking.id,
        type: booking.type,
        origin: booking.origin || "normal",
        start_at: booking.start_at,
        end_at: booking.end_at,
        status: booking.status,
        payment_method: booking.payment_method,
        payment_status: booking.payment_status,
        notes: booking.notes,
        created_at: booking.created_at,
      },
      professional: {
        id: booking.professional?.id || booking.professional_id,
        name: booking.professional?.name || "Unknown",
        email: booking.professional?.email || null,
        phone: booking.professional?.phone || null,
      },
      location: {
        id: booking.location?.id || booking.location_id,
        name: booking.location?.name || "Unknown",
        address: booking.location?.address || null,
        timezone: booking.location?.timezone || null,
      },
      customer: {
        id: booking.customer?.id || booking.user_id,
        name: booking.customer?.name || "Unknown",
        email: booking.customer?.email || "unknown@email.com",
        phone: booking.customer?.phone || null,
        app_user_id: booking.customer?.app_user_id || "",
      },
    };

    // Add service data if present
    if (booking.service) {
      payload.service = {
        id: booking.service.id,
        name: booking.service.name,
        price: booking.service.price,
        duration_min: booking.service.duration_min,
        currency: booking.service.currency,
        category_name: booking.service.category?.name,
      };
    }

    // Add class data if present
    if (booking.class) {
      payload.class = {
        id: booking.class.id,
        name: booking.class.name,
        capacity: booking.class.capacity,
        price: booking.class.price,
        currency: booking.class.currency,
      };
    }

    // Add voucher data if present
    if (voucherData) {
      payload.voucher = voucherData;
    }

    // Add subscription data if present
    if (subscriptionData) {
      payload.subscription = subscriptionData;
    }

    // Add previous_data for modification events
    if (event === "booking.updated" && previous_start_at && previous_end_at) {
      payload.previous_data = {
        start_at: previous_start_at,
        end_at: previous_end_at,
      };
    }

    // Add cancellation reason for cancelled events
    if (cancellationReason) {
      payload.cancellation_reason = cancellationReason;
    }

    console.log("Sending webhook payload:", JSON.stringify(payload, null, 2));

    // Send the webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseStatus = webhookResponse.status;
    const responseText = await webhookResponse.text();

    console.log(`Webhook response: ${responseStatus} - ${responseText}`);

    // Log to outbound_webhooks table
    const { error: logError } = await supabase.from("outbound_webhooks").insert({
      event: event,
      payload: payload,
      status: responseStatus >= 200 && responseStatus < 300 ? "sent" : "failed",
      sent_at: new Date().toISOString(),
      last_error: responseStatus >= 200 && responseStatus < 300 ? null : `HTTP ${responseStatus}: ${responseText}`,
    });

    if (logError) {
      console.error("Error logging webhook:", logError);
    }

    return new Response(
      JSON.stringify({
        success: responseStatus >= 200 && responseStatus < 300,
        booking_id,
        event,
        webhook_status: responseStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-booking-webhook:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
