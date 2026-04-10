import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// HMAC-SHA256 implementation for Deno
async function createHmacSignature(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const hashArray = Array.from(new Uint8Array(signature))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url, secret } = await req.json()

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'Webhook URL is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Create test payload
    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Test webhook from Reservas Pro',
        source: 'settings_panel'
      }
    }

    const payloadString = JSON.stringify(testPayload)
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ReservasPro-Webhook/1.0'
    }

    // Add HMAC signature if secret is provided
    if (secret && secret.trim()) {
      try {
        const signature = await createHmacSignature(secret.trim(), payloadString)
        headers['X-Signature'] = `sha256=${signature}`
        headers['X-Timestamp'] = testPayload.timestamp
      } catch (error) {
        console.error('Error creating HMAC signature:', error)
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create webhook signature' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }
    }

    // Send webhook
    console.log(`Sending test webhook to: ${url}`)
    
    const webhookResponse = await fetch(url, {
      method: 'POST',
      headers,
      body: payloadString
    })

    console.log(`Webhook response status: ${webhookResponse.status}`)

    // Create Supabase client for logging
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Log audit event
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        action: 'webhook.n8n.tested',
        entity_type: 'settings',
        entity_id: 'n8n_webhook',
        actor: 'system', // In production, get from auth context
        data: { 
          url, 
          status: webhookResponse.status,
          has_secret: !!secret?.trim(),
          timestamp: testPayload.timestamp
        }
      })

    if (webhookResponse.ok) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Webhook test successful. Status: ${webhookResponse.status}`,
          status: webhookResponse.status
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      let errorMessage = `Webhook failed with status ${webhookResponse.status}`
      try {
        const errorBody = await webhookResponse.text()
        if (errorBody) {
          errorMessage += `: ${errorBody.substring(0, 200)}`
        }
      } catch (e) {
        // Ignore error reading response body
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          status: webhookResponse.status
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

  } catch (error) {
    console.error('Error in test-n8n-webhook function:', error)
    
    let errorMessage = 'Internal server error'
    if (error instanceof TypeError && error.message.includes('fetch')) {
      errorMessage = 'Failed to connect to webhook URL. Please verify the URL is correct and accessible.'
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})