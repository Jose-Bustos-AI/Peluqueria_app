import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // CORS para webs externas
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      }
    })
  }

  const headers = {
    'Content-Type': 'application/manifest+json',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  }

  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')

  // Sin slug: manifest generico de la plataforma
  if (!slug) {
    return new Response(JSON.stringify({
      name: 'Reservas Pro',
      short_name: 'Reservas Pro',
      start_url: '/widget',
      display: 'standalone',
      theme_color: '#252c58',
      background_color: '#ffffff',
      icons: [
        { src: '/favicon.ico', sizes: '64x64', type: 'image/x-icon' },
        { src: '/pleno-logo-new.png', sizes: '192x192', type: 'image/png' },
        { src: '/pleno-logo-new.png', sizes: '512x512', type: 'image/png' }
      ]
    }, null, 2), { headers })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: org, error } = await supabaseAdmin
    .from('organizations_public')
    .select('name, slug, primary_color, secondary_color, logo_url')
    .eq('slug', slug)
    .single()

  if (error || !org) {
    return new Response(
      JSON.stringify({ error: 'Organization not found' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    )
  }

  const shortName = org.name.length > 12 ? org.name.substring(0, 12) : org.name

  const icons = org.logo_url
    ? [
        { src: org.logo_url, sizes: '192x192', type: 'image/png' },
        { src: org.logo_url, sizes: '512x512', type: 'image/png' }
      ]
    : [
        { src: '/favicon.ico', sizes: '64x64', type: 'image/x-icon' },
        { src: '/pleno-logo-new.png', sizes: '192x192', type: 'image/png' },
        { src: '/pleno-logo-new.png', sizes: '512x512', type: 'image/png' }
      ]

  const manifest = {
    name: org.name,
    short_name: shortName,
    start_url: `/widget?slug=${org.slug}`,
    display: 'standalone',
    theme_color: org.primary_color,
    background_color: org.secondary_color,
    icons
  }

  return new Response(JSON.stringify(manifest, null, 2), { headers })
})
