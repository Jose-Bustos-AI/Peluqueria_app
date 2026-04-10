// /supabase/functions/_shared/stripe-tenant.ts
//
// Módulo compartido para obtener claves Stripe dinámicas por tenant.
// Importar desde cualquier Edge Function:
//   import { getStripeKeysForOrg, getOrgIdFromRequest } from "../_shared/stripe-tenant.ts"

interface StripeKeys {
  secretKey: string
  publishableKey: string
  webhookSecret: string | null
}

/**
 * Obtiene las claves Stripe de una organización desde la tabla organizations.
 * Las claves _enc se devuelven tal cual (cifrado se implementa después).
 */
export async function getStripeKeysForOrg(
  supabaseClient: any,
  organizationId: string
): Promise<StripeKeys> {
  const { data: org, error } = await supabaseClient
    .from('organizations')
    .select('stripe_secret_key_enc, stripe_public_key, stripe_webhook_secret_enc, name')
    .eq('id', organizationId)
    .eq('active', true)
    .single()

  if (error || !org) {
    throw new Error(`Organization not found: ${organizationId}`)
  }

  if (!org.stripe_secret_key_enc) {
    throw new Error(`Stripe secret key not configured for organization: ${org.name} (${organizationId})`)
  }

  if (!org.stripe_public_key) {
    throw new Error(`Stripe publishable key not configured for organization: ${org.name} (${organizationId})`)
  }

  return {
    secretKey: org.stripe_secret_key_enc,
    publishableKey: org.stripe_public_key,
    webhookSecret: org.stripe_webhook_secret_enc || null,
  }
}

/**
 * Resuelve el organization_id desde la request:
 *  1. Header 'x-organization-id' (usado por el widget)
 *  2. Fallback: busca en admin_users por el email del usuario autenticado via Supabase Auth
 */
export async function getOrgIdFromRequest(
  supabaseClient: any,
  req: Request
): Promise<string> {
  // 1. Header explícito (widget / frontend)
  const headerOrgId = req.headers.get('x-organization-id')
  if (headerOrgId) {
    const { data: org, error } = await supabaseClient
      .from('organizations')
      .select('id')
      .eq('id', headerOrgId)
      .eq('active', true)
      .single()

    if (error || !org) {
      throw new Error(`Invalid or inactive organization: ${headerOrgId}`)
    }
    return org.id
  }

  // 2. Fallback: verificar JWT via Supabase Auth y buscar en admin_users
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !user) {
    throw new Error('Missing organization context: no x-organization-id header and no valid auth token')
  }

  const email = user.email
  if (!email) {
    throw new Error('No email found in authenticated user')
  }

  const { data: adminUser, error } = await supabaseClient
    .from('admin_users')
    .select('organization_id')
    .eq('email', email)
    .eq('active', true)
    .not('organization_id', 'is', null)
    .single()

  if (error || !adminUser) {
    throw new Error(`No organization found for user: ${email}`)
  }

  return adminUser.organization_id
}
