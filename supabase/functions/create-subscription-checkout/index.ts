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
    const { plan_id, user_id, success_url, cancel_url } = await req.json()

    if (!plan_id || !user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'plan_id and user_id are required' }),
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

    // Load subscription plan
    const { data: plan, error: planError } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('id', plan_id)
      .eq('active', true)
      .single()

    if (planError || !plan) {
      console.error('[Subs] Plan not found:', planError)
      return new Response(
        JSON.stringify({ success: false, error: 'Subscription plan not found' }),
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
      console.error('[Subs] User not found:', userError)
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    // Calculate amount in cents
    const base_price = parseFloat(plan.price.toString())
    const amount_cents = Math.round(base_price * 100)
    const currency = plan.currency || 'EUR'

    console.log('[Subs] create checkout plan=', plan_id, 'amount=', amount_cents, currency, 'user=', user_id)

    // Create Stripe checkout session using direct API call
    // Resolver tenant y obtener claves Stripe dinámicas
    const organizationId = await getOrgIdFromRequest(supabaseAdmin, req)
    const stripeKeys = await getStripeKeysForOrg(supabaseAdmin, organizationId)
    const secretKey = stripeKeys.secretKey

    const interval = plan.cycle === 'weekly' ? 'week' : 'month'

    // Use provided URLs or fallback to origin-based URLs
    const origin = req.headers.get('origin') || 'https://widget.example.com'
    const finalSuccessUrl = success_url || `${origin}/#/mi-cuenta`
    const finalCancelUrl = cancel_url || `${origin}/#/suscripciones`

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'line_items[0][price_data][currency]': currency.toLowerCase(),
        'line_items[0][price_data][product_data][name]': plan.name,
        'line_items[0][price_data][unit_amount]': amount_cents.toString(),
        'line_items[0][price_data][recurring][interval]': interval,
        'line_items[0][quantity]': '1',
        'success_url': finalSuccessUrl + '?session_id={CHECKOUT_SESSION_ID}',
        'cancel_url': finalCancelUrl,
        'customer_email': user.email || '',
        'client_reference_id': user_id,
        'metadata[plan_id]': plan_id,
        'metadata[user_id]': user_id,
        'metadata[action]': 'subscription_purchase',
        'metadata[organization_id]': organizationId
      })
    })

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.text()
      console.error('[Stripe] API error:', errorData)
      throw new Error(`Stripe API error: ${stripeResponse.status}`)
    }

    const checkout_session = await stripeResponse.json()

    console.log('[Subs] checkout session created:', checkout_session.id)

    return new Response(
      JSON.stringify({ 
        success: true, 
        checkout_url: checkout_session.url,
        session_id: checkout_session.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Subs] Error in create-subscription-checkout:', error)
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