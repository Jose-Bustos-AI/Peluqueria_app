-- =============================================================
-- SCRIPT 2: Añadir organization_id a tablas operativas
-- =============================================================

-- 1. locations
ALTER TABLE public.locations
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_locations_org ON public.locations(organization_id);

-- 2. professionals
ALTER TABLE public.professionals
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_professionals_org ON public.professionals(organization_id);

-- 3. categories
ALTER TABLE public.categories
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_categories_org ON public.categories(organization_id);

-- 4. services
ALTER TABLE public.services
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_services_org ON public.services(organization_id);

-- 5. classes
ALTER TABLE public.classes
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_classes_org ON public.classes(organization_id);

-- 6. class_sessions
ALTER TABLE public.class_sessions
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_class_sessions_org ON public.class_sessions(organization_id);

-- 7. bookings
ALTER TABLE public.bookings
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_bookings_org ON public.bookings(organization_id);

-- 8. waitlist
ALTER TABLE public.waitlist
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_waitlist_org ON public.waitlist(organization_id);

-- 9. payments
ALTER TABLE public.payments
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_payments_org ON public.payments(organization_id);

-- 10. refunds
ALTER TABLE public.refunds
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_refunds_org ON public.refunds(organization_id);

-- 11. voucher_types
ALTER TABLE public.voucher_types
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_voucher_types_org ON public.voucher_types(organization_id);

-- 12. vouchers
ALTER TABLE public.vouchers
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_vouchers_org ON public.vouchers(organization_id);

-- 13. voucher_redemptions
ALTER TABLE public.voucher_redemptions
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_voucher_redemptions_org ON public.voucher_redemptions(organization_id);

-- 14. subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_subscriptions_org ON public.subscriptions(organization_id);

-- 15. subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_subscription_plans_org ON public.subscription_plans(organization_id);

-- 16. subscription_invoices
ALTER TABLE public.subscription_invoices
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_subscription_invoices_org ON public.subscription_invoices(organization_id);

-- 17. users_shadow
ALTER TABLE public.users_shadow
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_users_shadow_org ON public.users_shadow(organization_id);

-- 18. admin_users
ALTER TABLE public.admin_users
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_admin_users_org ON public.admin_users(organization_id);

-- 19. settings (reemplazar PK simple por compuesta)
ALTER TABLE public.settings
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.settings DROP CONSTRAINT settings_pkey;
ALTER TABLE public.settings ADD PRIMARY KEY (key, organization_id);

-- 20. audit_logs
ALTER TABLE public.audit_logs
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_audit_logs_org ON public.audit_logs(organization_id);

-- 21. quipu_invoices
ALTER TABLE public.quipu_invoices
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_quipu_invoices_org ON public.quipu_invoices(organization_id);

-- 22. outbound_webhooks
ALTER TABLE public.outbound_webhooks
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_outbound_webhooks_org ON public.outbound_webhooks(organization_id);

-- 23. role_templates
ALTER TABLE public.role_templates
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
CREATE INDEX idx_role_templates_org ON public.role_templates(organization_id);
