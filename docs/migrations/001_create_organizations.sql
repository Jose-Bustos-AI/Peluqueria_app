-- =============================================================
-- SCRIPT 1: Crear tabla organizations (con vista publica segura)
-- =============================================================

CREATE TABLE public.organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,           -- identificador URL: /mi-clinica
  name          TEXT NOT NULL,
  primary_color TEXT NOT NULL DEFAULT '#000000',
  secondary_color TEXT NOT NULL DEFAULT '#ffffff',
  logo_url      TEXT,

  -- Stripe (claves cifradas en _enc)
  stripe_secret_key_enc    TEXT,
  stripe_public_key        TEXT,
  stripe_webhook_secret_enc TEXT,

  -- Quipu
  quipu_api_key_enc TEXT,

  -- n8n
  n8n_webhook_url TEXT,

  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para auto-actualizar updated_at
CREATE OR REPLACE FUNCTION public.handle_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_organizations_updated_at();

-- RLS: solo superadmins de plataforma pueden gestionar organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage organizations"
  ON public.organizations
  FOR ALL
  USING (
    auth.email() IN (
      SELECT email FROM public.admin_users
      WHERE role = 'superadmin' AND active = true
    )
  );

-- NO hay politica de lectura publica en la tabla.
-- El acceso publico es SOLO a traves de la vista segura.

-- Vista publica SECURITY DEFINER: expone solo campos de branding
CREATE VIEW public.organizations_public
  WITH (security_invoker = false)
AS
  SELECT id, slug, name, primary_color, secondary_color, logo_url, active
  FROM public.organizations
  WHERE active = true;

GRANT SELECT ON public.organizations_public TO anon, authenticated;

COMMENT ON TABLE public.organizations IS 'Tenant raiz: cada clinica es una organization';
COMMENT ON VIEW public.organizations_public IS 'Vista publica segura -- solo branding, sin claves cifradas. El widget lee de aqui.';
