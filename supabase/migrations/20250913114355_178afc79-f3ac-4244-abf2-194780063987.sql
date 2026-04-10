-- Create superadmin user in admin_users table
-- This will create the initial SUPERADMIN account

INSERT INTO public.admin_users (
  email,
  name,
  role,
  active,
  allowed_sections,
  professional_id
) VALUES (
  'plenosaludyrendimiento@gmail.com',
  'Super Administrador',
  'gerente',
  true,
  ARRAY['dashboard', 'calendar', 'bookings', 'users', 'locations', 'categories', 'services', 'classes', 'professionals', 'vouchers', 'subscriptions', 'payments', 'reports', 'notifications', 'settings', 'audit', 'roles'],
  null
) ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  active = EXCLUDED.active,
  allowed_sections = EXCLUDED.allowed_sections;

-- Insert audit log for superadmin creation
INSERT INTO public.audit_logs (
  action,
  entity_type,
  entity_id,
  actor,
  data
) VALUES (
  'admin.user.seeded',
  'admin_user',
  'plenosaludyrendimiento@gmail.com',
  'system',
  '{"role": "gerente", "sections_count": 18}'::jsonb
);