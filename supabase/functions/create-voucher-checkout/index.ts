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
    const { voucher_type_id, user_id, success_url, cancel_url } = await req.json()

    if (!voucher_type_id || !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'voucher_type_id and user_id are required' }),
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

    // Load voucher type
    const { data: voucherType, error: voucherError } = await supabaseAdmin
      .from('voucher_types')
      .select('*')
      .eq('id', voucher_type_id)
      .eq('active', true)
      .single()

    if (voucherError || !voucherType) {
      console.error('[Stripe] Voucher type not found:', voucherError)
      return new Response(
        JSON.stringify({ success: false, error: 'Voucher type not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    // Load user for customer info
    const { data: user, error: userError } = await supabaseAdmin
      .from('users_shadow')
      .select('id, email, name')
      .eq('id', user_id)
      .single()

    if (userError || !user) {
      console.error('[Stripe] User not found:', userError)
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    // Load settings for VAT calculation
    const { data: settings } = await supabaseAdmin
      .from('settings')
      .select('key, value')

    const settingsObj = (settings || []).reduce((acc: any, s: any) => {
      acc[s.key] = s.value
      return acc
    }, {})

    // Calculate amount with VAT
    const base_price = parseFloat(voucherType.price.toString())
    const vat_percent = parseFloat(settingsObj['payments.vat_percent']) || 0
    const prices_include_vat = settingsObj['payments.prices_include_vat'] ?? false
    const currency = voucherType.currency || settingsObj['payments.currency_default'] || 'EUR'

    let amount_cents: number
    if (prices_include_vat) {
      amount_cents = Math.round(base_price * 100)
    } else {
      const amount_with_vat = base_price * (1 + vat_percent / 100)
      amount_cents = Math.round(amount_with_vat * 100)
    }

    console.log('[Stripe] create voucher checkout amount=', amount_cents, 'currency=', currency, 'base_price=', base_price)

    // Create Stripe checkout session using direct API call
    // Resolver tenant y obtener claves Stripe dinámicas
    const organizationId = await getOrgIdFromRequest(supabaseAdmin, req)
    const stripeKeys = await getStripeKeysForOrg(supabaseAdmin, organizationId)
    const secretKey = stripeKeys.secretKey

    const origin = req.headers.get('origin') || 'https://widget.example.com'
    const finalSuccessUrl = success_url || `${origin}/#/mi-cuenta`
    const finalCancelUrl = cancel_url || `${origin}/#/bonos`

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'line_items[0][price_data][currency]': currency.toLowerCase(),
        'line_items[0][price_data][product_data][name]': voucherType.name,
        'line_items[0][price_data][unit_amount]': amount_cents.toString(),
        'line_items[0][quantity]': '1',
        'success_url': finalSuccessUrl + '?session_id={CHECKOUT_SESSION_ID}',
        'cancel_url': finalCancelUrl,
        'customer_email': user.email || '',
        'client_reference_id': user_id,
        'metadata[voucher_type_id]': voucher_type_id,
        'metadata[user_id]': user_id,
        'metadata[action]': 'voucher_purchase',
        'metadata[organization_id]': organizationId
      })
    })

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.text()
      console.error('[Stripe] API error:', errorData)
      throw new Error(`Stripe API error: ${stripeResponse.status}`)
    }

    const session = await stripeResponse.json()

    return new Response(
      JSON.stringify({ 
        success: true, 
        checkout_url: session.url,
        session_id: session.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout session'
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})