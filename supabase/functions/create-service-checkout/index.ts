import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getStripeKeysForOrg, getOrgIdFromRequest } from "../_shared/stripe-tenant.ts"

// CORS helper function
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'https://gxofivnfnzefpfkzwqpe.supabase.co'
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
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { booking_id, success_url, cancel_url } = await req.json()

    if (!booking_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'booking_id is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Load settings
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('settings')
      .select('key, value')

    if (settingsError) {
      console.error('[Stripe] Error loading settings:', settingsError)
      throw new Error('Settings not found')
    }

    const settingsObj = (settings || []).reduce((acc: any, s: any) => {
      acc[s.key] = s.value
      return acc
    }, {})

    // Load booking with service and user data
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        service_id,
        user_id,
        origin,
        type,
        payment_status,
        services (id, name, price, currency),
        users_shadow (id, email, name)
      `)
      .eq('id', booking_id)
      .single()

    if (bookingError || !booking) {
      console.error('[Stripe] Booking not found:', bookingError)
      return new Response(
        JSON.stringify({ success: false, error: 'Booking not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    if (booking.type !== 'service') {
      console.error('[Stripe] Invalid booking type:', booking.type)
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid booking type - must be service' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    if (!['normal'].includes(booking.origin)) {
      console.error('[Stripe] Invalid booking origin, only normal allowed for direct payment')
      return new Response(
        JSON.stringify({ success: false, error: `Invalid booking origin: ${booking.origin}` }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    if (booking.payment_status !== 'unpaid') {
      console.error('[Stripe] Invalid payment_status, must be unpaid')
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payment_status - must be unpaid' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Fix: Access first element of arrays for related data
    const service = Array.isArray(booking.services) ? booking.services[0] : booking.services
    const user = Array.isArray(booking.users_shadow) ? booking.users_shadow[0] : booking.users_shadow

    if (!service || !user) {
      console.error('[Stripe] Missing service or user data')
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid booking data' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Calculate amount with VAT
    const base_price = parseFloat(service.price.toString())
    const vat_percent = parseFloat(settingsObj['payments.vat_percent']) || 0
    const prices_include_vat = settingsObj['payments.prices_include_vat'] ?? false
    const currency = service.currency || settingsObj['payments.currency_default'] || 'EUR'

    let amount_cents: number
    if (prices_include_vat) {
      amount_cents = Math.round(base_price * 100)
    } else {
      const amount_with_vat = base_price * (1 + vat_percent / 100)
      amount_cents = Math.round(amount_with_vat * 100)
    }

    console.log('[Stripe] create service checkout booking=', booking_id, 'amount=', amount_cents, 'currency=', currency)

    // Create Stripe checkout session using direct API call
    // Resolver tenant y obtener claves Stripe dinámicas
    const organizationId = await getOrgIdFromRequest(supabaseAdmin, req)
    const stripeKeys = await getStripeKeysForOrg(supabaseAdmin, organizationId)
    const secretKey = stripeKeys.secretKey

    const origin = req.headers.get('origin') || 'https://widget.example.com'
    const successUrl = success_url || `${origin}/#/exito?booking_id=${booking_id}`
    const cancelUrl = cancel_url || `${origin}/#/confirmacion?booking_id=${booking_id}`

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'line_items[0][price_data][currency]': currency.toLowerCase(),
        'line_items[0][price_data][product_data][name]': service.name || 'Servicio',
        'line_items[0][price_data][unit_amount]': amount_cents.toString(),
        'line_items[0][quantity]': '1',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'customer_email': user.email || '',
        'client_reference_id': booking_id,
        'metadata[booking_id]': booking_id,
        'metadata[action]': 'service_payment',
        'metadata[organization_id]': organizationId
      })
    })

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.text()
      console.error('[Stripe] API error:', errorData)
      throw new Error(`Stripe API error: ${stripeResponse.status}`)
    }

    const checkout_session = await stripeResponse.json()

    return new Response(
      JSON.stringify({ 
        success: true, 
        checkout_url: checkout_session.url,
        session_id: checkout_session.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Stripe] Error in create-service-checkout:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})