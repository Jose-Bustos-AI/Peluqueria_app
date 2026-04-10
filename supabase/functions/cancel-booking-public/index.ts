// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS helper function
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'https://gxofivnfnzefpfkzwqpe.supabase.co',
    'https://administracion.plenosalud.es'
  ];
  
  // Allow all vercel.app subdomains and any custom domain
  if (origin && (origin.includes('.vercel.app') || !origin.includes('localhost') && !origin.includes('supabase.co'))) {
    allowedOrigins.push(origin);
  }
  
  const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { bookingId, email, reason } = await req.json();

    if (!bookingId || !email) {
      return new Response(JSON.stringify({ error: "bookingId and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Load booking
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, user_id, start_at, end_at, status, payment_method, payment_status, origin, notes")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingErr) throw bookingErr;
    if (!booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Verify owner by email using users_shadow
    const { data: user, error: userErr } = await supabase
      .from("users_shadow")
      .select("id, email, name")
      .eq("id", booking.user_id)
      .maybeSingle();

    if (userErr) throw userErr;
    const normalized = (s: string) => String(s || "").trim().toLowerCase();

    if (!user || normalized(user.email) !== normalized(email)) {
      return new Response(JSON.stringify({ error: "Not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Prevent late cancellations (< 2h)
    const now = new Date();
    const start = new Date(booking.start_at);
    const minAdvanceMs = 2 * 60 * 60 * 1000;
    if (start.getTime() - now.getTime() < minAdvanceMs) {
      return new Response(JSON.stringify({ error: "Too late to cancel" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (booking.status === "cancelled") {
      return new Response(JSON.stringify({ status: "already_cancelled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cancelNote = `\n\nCancelado: ${reason || "Sin motivo especificado"}`;

    // 4) Cancel booking
    const { error: updateErr } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
        notes: (booking.notes || "") + cancelNote,
      })
      .eq("id", booking.id);

    if (updateErr) throw updateErr;

    // 5) Voucher reversal if exists
    try {
      const { data: redemption, error: redErr } = await supabase
        .from("voucher_redemptions")
        .select("id, status")
        .eq("booking_id", booking.id)
        .eq("status", "captured")
        .maybeSingle();

      if (!redErr && redemption) {
        await supabase
          .from("voucher_redemptions")
          .update({ status: "reversed" })
          .eq("id", redemption.id);
      }
    } catch (_) {
      // do not fail cancellation if voucher step breaks
    }

    // 6) Card payment: mark as refund pending
    if (booking.payment_method === "card" && booking.payment_status === "paid") {
      await supabase
        .from("bookings")
        .update({ payment_status: "refund_pending" })
        .eq("id", booking.id);
    }

    return new Response(
      JSON.stringify({ status: "cancelled", bookingId: booking.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[cancel-booking-public] error", err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});