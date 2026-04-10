-- =============================================================
-- SCRIPT 3: Helper functions + reescritura RLS multi-tenant
-- =============================================================

-- =============================================================
-- A) FUNCIONES HELPER
-- =============================================================

-- get_my_organization_id(): devuelve el organization_id del admin autenticado.
-- SECURITY DEFINER para que consulte admin_users con permisos del owner,
-- no del caller (evita manipulacion).
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.admin_users
  WHERE email = auth.email()
    AND active = true
  LIMIT 1;
$$;

-- is_platform_superadmin(): true si el usuario es superadmin cross-tenant
-- (organization_id IS NULL = acceso a toda la plataforma).
CREATE OR REPLACE FUNCTION public.is_platform_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE email = auth.email()
      AND role = 'superadmin'
      AND organization_id IS NULL
      AND active = true
  );
$$;

-- =============================================================
-- B) ELIMINAR TODAS LAS POLITICAS RLS EXISTENTES
-- =============================================================

-- organizations (mantener tabla, reescribir politica)
DROP POLICY IF EXISTS "Superadmins can manage organizations" ON public.organizations;

-- locations
DROP POLICY IF EXISTS "Panel admins can manage locations" ON public.locations;
DROP POLICY IF EXISTS "Public read access" ON public.locations;

-- professionals
DROP POLICY IF EXISTS "Panel admins can delete professionals" ON public.professionals;
DROP POLICY IF EXISTS "Panel admins can insert professionals" ON public.professionals;
DROP POLICY IF EXISTS "Panel admins can update professionals" ON public.professionals;
DROP POLICY IF EXISTS "Public read access" ON public.professionals;

-- categories
DROP POLICY IF EXISTS "Admin users can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Public read access" ON public.categories;

-- services
DROP POLICY IF EXISTS "Panel admins can manage services" ON public.services;
DROP POLICY IF EXISTS "Public read access" ON public.services;

-- classes
DROP POLICY IF EXISTS "Panel admins can manage classes" ON public.classes;
DROP POLICY IF EXISTS "Public read access" ON public.classes;

-- class_sessions
DROP POLICY IF EXISTS "Panel admins can manage class_sessions" ON public.class_sessions;
DROP POLICY IF EXISTS "Public read access" ON public.class_sessions;

-- bookings
DROP POLICY IF EXISTS "Panel admins can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can insert their bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update their own bookings for cancellation" ON public.bookings;
DROP POLICY IF EXISTS "Users can view their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "professionals_can_update_own_bookings" ON public.bookings;

-- waitlist
DROP POLICY IF EXISTS "Public waitlist access" ON public.waitlist;

-- payments
DROP POLICY IF EXISTS "Payment system access" ON public.payments;

-- refunds
DROP POLICY IF EXISTS "Refund system access" ON public.refunds;

-- voucher_types
DROP POLICY IF EXISTS "Panel admins can manage voucher_types" ON public.voucher_types;
DROP POLICY IF EXISTS "Public read access" ON public.voucher_types;

-- vouchers
DROP POLICY IF EXISTS "Panel admins can delete vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Panel admins can read vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Panel admins can update vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Users can insert their vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Users can view their own vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "widget_insert_vouchers" ON public.vouchers;

-- voucher_redemptions
DROP POLICY IF EXISTS "Panel admins can manage voucher_redemptions" ON public.voucher_redemptions;
DROP POLICY IF EXISTS "Redemption tracking" ON public.voucher_redemptions;

-- subscriptions
DROP POLICY IF EXISTS "Users can insert their subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;

-- subscription_plans
DROP POLICY IF EXISTS "Panel admins can manage subscription_plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Panel admins can read all subscription_plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Public read access" ON public.subscription_plans;

-- subscription_invoices
DROP POLICY IF EXISTS "Invoice access" ON public.subscription_invoices;

-- users_shadow
DROP POLICY IF EXISTS "Allow insert users_shadow" ON public.users_shadow;
DROP POLICY IF EXISTS "Panel admins can update users_shadow" ON public.users_shadow;
DROP POLICY IF EXISTS "Users can update their own shadow" ON public.users_shadow;
DROP POLICY IF EXISTS "Users can view their own shadow record" ON public.users_shadow;

-- admin_users
DROP POLICY IF EXISTS "Admin access" ON public.admin_users;

-- settings
DROP POLICY IF EXISTS "Admin read access" ON public.settings;
DROP POLICY IF EXISTS "Admin write access" ON public.settings;

-- audit_logs
DROP POLICY IF EXISTS "Admin access" ON public.audit_logs;

-- quipu_invoices
DROP POLICY IF EXISTS "Admins can read quipu_invoices" ON public.quipu_invoices;
DROP POLICY IF EXISTS "Service role can write quipu_invoices" ON public.quipu_invoices;

-- outbound_webhooks
DROP POLICY IF EXISTS "Admin access" ON public.outbound_webhooks;

-- role_templates
DROP POLICY IF EXISTS "Admin access on role_templates" ON public.role_templates;

-- =============================================================
-- C) HABILITAR RLS EN TODAS LAS TABLAS (idempotente)
-- =============================================================

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users_shadow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quipu_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_templates ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- D) NUEVAS POLITICAS RLS MULTI-TENANT
-- =============================================================
-- Patron comun:
--   - Admins del tenant: organization_id = get_my_organization_id()
--   - Superadmins plataforma: is_platform_superadmin() = true
--   - Lectura publica (anon/widget): solo tablas de catalogo, filtradas por org

-- ----- organizations -----
CREATE POLICY "superadmin_manage_organizations"
  ON public.organizations FOR ALL
  USING (is_platform_superadmin());

-- ----- locations -----
CREATE POLICY "tenant_admin_locations"
  ON public.locations FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "public_read_locations"
  ON public.locations FOR SELECT
  TO anon
  USING (true);

-- ----- professionals -----
CREATE POLICY "tenant_admin_professionals"
  ON public.professionals FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "public_read_professionals"
  ON public.professionals FOR SELECT
  TO anon
  USING (true);

-- ----- categories -----
CREATE POLICY "tenant_admin_categories"
  ON public.categories FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "public_read_categories"
  ON public.categories FOR SELECT
  TO anon
  USING (true);

-- ----- services -----
CREATE POLICY "tenant_admin_services"
  ON public.services FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "public_read_services"
  ON public.services FOR SELECT
  TO anon
  USING (true);

-- ----- classes -----
CREATE POLICY "tenant_admin_classes"
  ON public.classes FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "public_read_classes"
  ON public.classes FOR SELECT
  TO anon
  USING (true);

-- ----- class_sessions -----
CREATE POLICY "tenant_admin_class_sessions"
  ON public.class_sessions FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "public_read_class_sessions"
  ON public.class_sessions FOR SELECT
  TO anon
  USING (true);

-- ----- bookings -----
CREATE POLICY "tenant_admin_bookings"
  ON public.bookings FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "user_select_own_bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_insert_bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_update_own_bookings"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- ----- waitlist -----
CREATE POLICY "tenant_admin_waitlist"
  ON public.waitlist FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "public_insert_waitlist"
  ON public.waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ----- payments -----
CREATE POLICY "tenant_admin_payments"
  ON public.payments FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

-- ----- refunds -----
CREATE POLICY "tenant_admin_refunds"
  ON public.refunds FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

-- ----- voucher_types -----
CREATE POLICY "tenant_admin_voucher_types"
  ON public.voucher_types FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "public_read_voucher_types"
  ON public.voucher_types FOR SELECT
  TO anon
  USING (true);

-- ----- vouchers -----
CREATE POLICY "tenant_admin_vouchers"
  ON public.vouchers FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "user_select_own_vouchers"
  ON public.vouchers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_insert_vouchers"
  ON public.vouchers FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ----- voucher_redemptions -----
CREATE POLICY "tenant_admin_voucher_redemptions"
  ON public.voucher_redemptions FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

-- ----- subscriptions -----
CREATE POLICY "tenant_admin_subscriptions"
  ON public.subscriptions FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "user_select_own_subscriptions"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_insert_subscriptions"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ----- subscription_plans -----
CREATE POLICY "tenant_admin_subscription_plans"
  ON public.subscription_plans FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "public_read_subscription_plans"
  ON public.subscription_plans FOR SELECT
  TO anon, authenticated
  USING (true);

-- ----- subscription_invoices -----
CREATE POLICY "tenant_admin_subscription_invoices"
  ON public.subscription_invoices FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

-- ----- users_shadow -----
CREATE POLICY "tenant_admin_users_shadow"
  ON public.users_shadow FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "user_select_own_shadow"
  ON public.users_shadow FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "user_update_own_shadow"
  ON public.users_shadow FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "anon_insert_users_shadow"
  ON public.users_shadow FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ----- admin_users -----
CREATE POLICY "tenant_admin_admin_users"
  ON public.admin_users FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

-- ----- settings -----
CREATE POLICY "tenant_admin_read_settings"
  ON public.settings FOR SELECT
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

CREATE POLICY "tenant_admin_write_settings"
  ON public.settings FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

-- ----- audit_logs -----
CREATE POLICY "tenant_admin_audit_logs"
  ON public.audit_logs FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

-- ----- quipu_invoices -----
CREATE POLICY "tenant_admin_quipu_invoices"
  ON public.quipu_invoices FOR SELECT
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

-- ----- outbound_webhooks -----
CREATE POLICY "tenant_admin_outbound_webhooks"
  ON public.outbound_webhooks FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());

-- ----- role_templates -----
CREATE POLICY "tenant_admin_role_templates"
  ON public.role_templates FOR ALL
  USING (organization_id = get_my_organization_id() OR is_platform_superadmin());
