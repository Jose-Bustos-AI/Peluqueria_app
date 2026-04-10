-- =============================================================
-- SCRIPT 4: Eliminar lectura publica sin filtro + helper de slug
-- =============================================================

-- =============================================================
-- A) FUNCION HELPER: resolver slug → organization_id
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_organization_id_by_slug(p_slug TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.organizations
  WHERE slug = p_slug
    AND active = true
  LIMIT 1;
$$;

-- =============================================================
-- B) ELIMINAR POLITICAS public_read_* (acceso anon sin filtro)
-- =============================================================

DROP POLICY IF EXISTS "public_read_locations" ON public.locations;
DROP POLICY IF EXISTS "public_read_professionals" ON public.professionals;
DROP POLICY IF EXISTS "public_read_categories" ON public.categories;
DROP POLICY IF EXISTS "public_read_services" ON public.services;
DROP POLICY IF EXISTS "public_read_classes" ON public.classes;
DROP POLICY IF EXISTS "public_read_class_sessions" ON public.class_sessions;
DROP POLICY IF EXISTS "public_read_voucher_types" ON public.voucher_types;
DROP POLICY IF EXISTS "public_read_subscription_plans" ON public.subscription_plans;

-- =============================================================
-- C) ELIMINAR POLITICA public_insert_waitlist (anon sin filtro)
-- =============================================================

DROP POLICY IF EXISTS "public_insert_waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "anon_insert_users_shadow" ON public.users_shadow;
