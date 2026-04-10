import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { subscription_id } = await req.json()

    console.log('[CancelSub] input subscription_id=', subscription_id)

    if (!subscription_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'subscription_id is required' }),
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

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      console.error('[CancelSub] Missing STRIPE_SECRET_KEY')
      return new Response(
        JSON.stringify({ success: false, error: 'Stripe configuration missing' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    // Load subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, cancel_at_period_end')
      .eq('id', subscription_id)
      .single()

    if (subError || !subscription) {
      console.error('[CancelSub] Subscription not found:', subError)
      return new Response(
        JSON.stringify({ success: false, error: 'Subscription not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    if (subscription.status !== 'active') {
      return new Response(
        JSON.stringify({ success: false, error: 'Subscription is not active' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    if (subscription.cancel_at_period_end) {
      return new Response(
        JSON.stringify({ success: false, error: 'Subscription is already scheduled for cancellation' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    const stripe_subscription_id = subscription.stripe_subscription_id

    if (stripe_subscription_id) {
      // Cancel Stripe subscription at period end
      console.log('[CancelSub] Calling Stripe API to cancel subscription:', stripe_subscription_id)
      
      try {
        const stripeResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${stripe_subscription_id}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'cancel_at_period_end': 'true'
          })
        })

        if (!stripeResponse.ok) {
          const errorData = await stripeResponse.text()
          console.error('[CancelSub] Stripe API error response:', errorData)
          throw new Error(`Stripe API error: ${stripeResponse.status}`)
        }

        const updatedSubscription = await stripeResponse.json()
        console.log('[CancelSub] Stripe call successful - subscription marked for cancellation, cancel_at:', updatedSubscription.cancel_at)
      } catch (stripeError) {
        console.error('[CancelSub] Stripe API error:', stripeError)
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to cancel subscription with Stripe' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }
    } else {
      console.log('[CancelSub] No Stripe ID found - manual subscription, skipping Stripe API call')
    }

    // Update local subscription record
    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({ 
        cancel_at_period_end: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription_id)

    if (updateError) {
      console.error('[CancelSub] Error updating local subscription:', updateError)
      throw new Error('Failed to update local subscription record')
    }

    console.log('[CancelSub] DB updated - cancel_at_period_end=true for subscription:', subscription_id)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Subscription will be cancelled at the end of the current period' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[CancelSub] Error in cancel-subscription:', error)
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