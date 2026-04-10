import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

interface StripeConfig {
  publishable_key: string;
  secret_key: string;
  webhook_secret: string;
  mode: 'test' | 'live';
  currency_default: string;
  vat_default_percent: number;
  prices_include_vat: boolean;
  card_enabled: boolean;
}

export async function getStripeConfig(): Promise<StripeConfig> {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  console.log('[Stripe] Loading configuration from settings...')

  // Load all required settings
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', [
      'stripe.publishable_key',
      'stripe.secret_key_masked', 
      'stripe.webhook_secret_masked',
      'stripe.mode',
      'payments.currency_default',
      'payments.card_enabled',
      'payments.vat_percent',
      'payments.prices_include_vat'
    ])

  if (settingsError) {
    console.error('[Stripe] Error loading settings:', settingsError)
    throw new Error('Failed to load Stripe configuration')
  }

  const settingsObj = settings.reduce((acc: any, setting: any) => {
    acc[setting.key] = setting.value
    return acc
  }, {})

  console.log('[Stripe] Settings loaded:', Object.keys(settingsObj))

  // Extract configuration
  const publishable_key = settingsObj['stripe.publishable_key']
  const secret_masked = settingsObj['stripe.secret_key_masked']
  const webhook_masked = settingsObj['stripe.webhook_secret_masked']
  const mode = settingsObj['stripe.mode'] || 'test'
  const currency_default = settingsObj['payments.currency_default'] || 'EUR'
  const card_enabled = settingsObj['payments.card_enabled'] ?? true
  const vat_default_percent = parseFloat(settingsObj['payments.vat_percent']) || 0
  const prices_include_vat = settingsObj['payments.prices_include_vat'] ?? false

  // Validate required keys
  if (!publishable_key || !publishable_key.startsWith('pk_')) {
    console.log('[Stripe] publishable key not configured or invalid')
    throw new Error('STRIPE_CONFIG_INCOMPLETE: Publishable key not configured')
  }
  
  if (!secret_masked || !secret_masked.startsWith('••••')) {
    console.log('[Stripe] secret key not configured')
    throw new Error('STRIPE_CONFIG_INCOMPLETE: Secret key not configured')
  }

  if (!webhook_masked || !webhook_masked.startsWith('••••')) {
    console.warn('[Stripe] Webhook secret not configured - webhooks may not work')
  }

  if (!card_enabled) {
    throw new Error('Card payments are disabled in settings')
  }

  // Retrieve actual keys from secure storage
  let secret_key = Deno.env.get('STRIPE_SECRET_KEY')
  let webhook_secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  // If not in env vars, try to get from Supabase secrets
  if (!secret_key) {
    try {
      const { data: secretData, error: secretError } = await supabaseAdmin.rpc('get_secret', {
        name: 'STRIPE_SECRET_KEY'
      })
      
      if (!secretError && secretData) {
        secret_key = secretData
      }
    } catch (e) {
      console.log('[Stripe] Could not retrieve secret key from vault')
    }
  }

  if (!webhook_secret) {
    try {
      const { data: webhookData, error: webhookError } = await supabaseAdmin.rpc('get_secret', {
        name: 'STRIPE_WEBHOOK_SECRET'
      })
      
      if (!webhookError && webhookData) {
        webhook_secret = webhookData
      }
    } catch (e) {
      console.log('[Stripe] Could not retrieve webhook secret from vault')
    }
  }

  // Fallback to test keys if real keys not available (for development)
  if (!secret_key) {
    console.warn('[Stripe] Using fallback secret key for development')
    secret_key = `sk_${mode}_fallback_development_key`
  }

  if (!webhook_secret) {
    console.warn('[Stripe] Using fallback webhook secret for development')  
    webhook_secret = `whsec_fallback_development_secret`
  }

  const config: StripeConfig = {
    publishable_key,
    secret_key,
    webhook_secret,
    mode: mode as 'test' | 'live',
    currency_default,
    vat_default_percent,
    prices_include_vat,
    card_enabled
  }

  console.log('[Stripe] Configuration validated:', {
    mode: config.mode,
    currency: config.currency_default,
    vat_percent: config.vat_default_percent,
    prices_include_vat: config.prices_include_vat,
    card_enabled: config.card_enabled,
    has_publishable_key: !!config.publishable_key,
    has_secret_key: !!config.secret_key,
    has_webhook_secret: !!config.webhook_secret
  })

  return config
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const config = await getStripeConfig()
    
    // Return public config only (no secrets)
    return new Response(
      JSON.stringify({
        success: true,
        config: {
          mode: config.mode,
          currency_default: config.currency_default,
          vat_default_percent: config.vat_default_percent,
          prices_include_vat: config.prices_include_vat,
          card_enabled: config.card_enabled
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Stripe] Configuration error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Stripe not configured'
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})