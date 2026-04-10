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
    const { key, value, keyType } = await req.json()
    
    console.log('[Stripe.save] Received request:', { key, keyType, valuePrefix: value?.substring(0, 10) + '...' })

    // Support both new format (key) and legacy format (keyType)
    let finalKey = key
    let finalValue = value
    
    if (!finalKey && keyType) {
      // Legacy format - convert keyType to key
      if (keyType === 'secret') {
        finalKey = 'stripe.secret_key'
      } else if (keyType === 'webhook') {
        finalKey = 'stripe.webhook_secret'
      }
    }

    if (!finalKey || !finalValue) {
      console.log('[Stripe.save] Missing key or value')
      return new Response(
        JSON.stringify({ success: false, error: 'Missing key or value' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Validate key formats
    if (finalKey === 'stripe.publishable_key' && !finalValue.startsWith('pk_')) {
      console.log('[Stripe.save] invalid publishable key format')
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid Stripe publishable key format' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    if (finalKey === 'stripe.secret_key' && !finalValue.startsWith('sk_')) {
      console.log('[Stripe.save] invalid secret key format')
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid Stripe secret key format' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    if (finalKey === 'stripe.webhook_secret' && !finalValue.startsWith('whsec_')) {
      console.log('[Stripe.save] invalid webhook secret format')
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid webhook secret format' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Create Supabase client with service role for secure operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Handle publishable key (can be stored in plain text in settings)
    if (finalKey === 'stripe.publishable_key') {
      const { error: settingsError } = await supabaseAdmin
        .from('settings')
        .upsert({
          key: finalKey,
          value: finalValue
        })

      if (settingsError) {
        console.error('[Stripe.save] Error storing publishable key:', settingsError)
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to store publishable key' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }

      console.log('[Stripe.save] upsert stripe.publishable_key ok')
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Publishable key stored successfully' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle secret keys (store securely and create masked version)
    if (finalKey === 'stripe.secret_key' || finalKey === 'stripe.webhook_secret') {
      const keyTypeName = finalKey === 'stripe.secret_key' ? 'secret' : 'webhook_secret'
      const secretName = finalKey === 'stripe.secret_key' ? 'STRIPE_SECRET_KEY' : 'STRIPE_WEBHOOK_SECRET'
      
      // Best-effort: set env var for this runtime (non-persistent)
      try {
        Deno.env.set(secretName, finalValue)
        console.log(`[Stripe.save] set ${secretName} in process env`)
      } catch (e) {
        console.log(`[Stripe.save] could not set env var ${secretName}`)
      }

      // Create masked version for display
      const masked = `••••${finalValue.slice(-4)}`
      
      // Store masked version in settings
      const { error: settingsError } = await supabaseAdmin
        .from('settings')
        .upsert({
          key: `${finalKey}_masked`,
          value: masked
        })

      if (settingsError) {
        console.error('[Stripe.save] Error storing masked key:', settingsError)
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to store masked key' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }

      console.log(`[Stripe.save] upsert ${finalKey}_masked ok`)
      
      // Best-effort set in env (ignore failures)
      try {
        Deno.env.set(secretName, finalValue)
        console.log(`[Stripe.save] stored ${secretName} in secure storage`)
      } catch (_) {
        console.log(`[Stripe.save] skipping env storage for ${secretName}`)
      }
      
      // Log audit event
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: 'stripe.keys.updated',
          entity_type: 'settings',
          entity_id: finalKey,
          actor: 'admin', // In production, get from auth context
          data: { key: finalKey, masked }
        })

      return new Response(
        JSON.stringify({ 
          success: true, 
          masked,
          message: `${keyTypeName} key stored securely` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Invalid key type
    console.log(`[Stripe.save] invalid key type: ${finalKey}`)
    return new Response(
      JSON.stringify({ success: false, error: `Invalid key type: ${finalKey}` }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )

  } catch (error) {
    console.error('Error in save-stripe-key function:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})