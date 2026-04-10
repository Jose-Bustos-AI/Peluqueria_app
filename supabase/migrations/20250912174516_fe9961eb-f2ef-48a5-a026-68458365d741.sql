-- A) Users shadow table
CREATE TABLE public.users_shadow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id TEXT UNIQUE NOT NULL, -- ID from external app
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- B) Catalog tables
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  lat DECIMAL(10,8),
  lng DECIMAL(11,8),
  phone TEXT,
  email TEXT,
  schedule JSONB, -- {"monday": {"open": "09:00", "close": "18:00"}, ...}
  gallery TEXT[], -- Array of image URLs
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('service', 'class', 'both')) DEFAULT 'both',
  icon_url TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  specialty TEXT,
  color TEXT DEFAULT '#3B82F6', -- For calendar display
  photo_url TEXT,
  bio TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  duration_min INTEGER NOT NULL,
  buffer_min INTEGER DEFAULT 0,
  credit_cost INTEGER DEFAULT 1, -- Credits consumed when paid with voucher
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id),
  name TEXT NOT NULL,
  description TEXT,
  duration_min INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  photo_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Relationship tables (many-to-many)
CREATE TABLE public.service_professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE,
  UNIQUE(service_id, professional_id)
);

CREATE TABLE public.service_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  UNIQUE(service_id, location_id)
);

CREATE TABLE public.class_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  UNIQUE(class_id, location_id)
);

CREATE TABLE public.class_professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE,
  UNIQUE(class_id, professional_id)
);

-- C) Calendar and bookings
CREATE TABLE public.class_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) NOT NULL,
  location_id UUID REFERENCES public.locations(id) NOT NULL,
  professional_id UUID REFERENCES public.professionals(id) NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL, -- Can override class default
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT CHECK (type IN ('service', 'class')) NOT NULL,
  service_id UUID REFERENCES public.services(id),
  class_id UUID REFERENCES public.classes(id),
  session_id UUID REFERENCES public.class_sessions(id),
  user_id UUID REFERENCES public.users_shadow(id) NOT NULL,
  professional_id UUID REFERENCES public.professionals(id) NOT NULL,
  location_id UUID REFERENCES public.locations(id) NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')) DEFAULT 'pending',
  origin TEXT CHECK (origin IN ('normal', 'voucher', 'subscription')) DEFAULT 'normal',
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'none')) DEFAULT 'none',
  payment_status TEXT CHECK (payment_status IN ('unpaid', 'paid', 'refunded', 'partial')) DEFAULT 'unpaid',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id),
  session_id UUID REFERENCES public.class_sessions(id),
  user_id UUID REFERENCES public.users_shadow(id) NOT NULL,
  status TEXT CHECK (status IN ('waiting', 'promoted', 'cancelled')) DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- D) Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id),
  subscription_invoice_id UUID, -- Will reference subscription_invoices
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  method TEXT CHECK (method IN ('cash', 'stripe')) NOT NULL,
  status TEXT CHECK (status IN ('requires_payment', 'succeeded', 'failed', 'refunded')) DEFAULT 'requires_payment',
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.payments(id) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT,
  status TEXT CHECK (status IN ('pending', 'succeeded', 'failed')) DEFAULT 'pending',
  stripe_refund_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- E) Vouchers/Bonos
CREATE TABLE public.voucher_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sessions_count INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  validity_days INTEGER, -- NULL means no expiration
  validity_end_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.voucher_type_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_type_id UUID REFERENCES public.voucher_types(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  UNIQUE(voucher_type_id, service_id)
);

CREATE TABLE public.voucher_type_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_type_id UUID REFERENCES public.voucher_types(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  UNIQUE(voucher_type_id, category_id)
);

CREATE TABLE public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_type_id UUID REFERENCES public.voucher_types(id) NOT NULL,
  user_id UUID REFERENCES public.users_shadow(id) NOT NULL,
  purchase_date TIMESTAMPTZ DEFAULT now(),
  expiry_date TIMESTAMPTZ,
  sessions_remaining INTEGER NOT NULL,
  status TEXT CHECK (status IN ('active', 'expired', 'refunded', 'blocked')) DEFAULT 'active',
  code TEXT UNIQUE, -- Optional voucher code
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.voucher_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES public.vouchers(id) NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) NOT NULL,
  credits_used INTEGER DEFAULT 1,
  status TEXT CHECK (status IN ('captured', 'returned')) DEFAULT 'captured',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- F) Subscriptions
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  cycle TEXT CHECK (cycle IN ('weekly', 'monthly')) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  cap_per_cycle INTEGER, -- NULL means unlimited
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.subscription_plan_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  UNIQUE(plan_id, class_id)
);

CREATE TABLE public.subscription_plan_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  UNIQUE(plan_id, category_id)
);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.subscription_plans(id) NOT NULL,
  user_id UUID REFERENCES public.users_shadow(id) NOT NULL,
  status TEXT CHECK (status IN ('active', 'paused', 'cancelled', 'past_due')) DEFAULT 'active',
  start_date TIMESTAMPTZ DEFAULT now(),
  next_billing_date TIMESTAMPTZ NOT NULL,
  cap_remaining_in_cycle INTEGER,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) NOT NULL,
  cycle_start TIMESTAMPTZ NOT NULL,
  cycle_end TIMESTAMPTZ NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  status TEXT CHECK (status IN ('paid', 'failed', 'refunded')) DEFAULT 'paid',
  stripe_invoice_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add foreign key reference to payments
ALTER TABLE public.payments ADD CONSTRAINT fk_payments_subscription_invoice
  FOREIGN KEY (subscription_invoice_id) REFERENCES public.subscription_invoices(id);

-- G) System configuration
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT, -- admin/employee ID or system
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.outbound_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL, -- e.g., 'booking.created'
  payload JSONB NOT NULL,
  status TEXT CHECK (status IN ('sent', 'failed')) DEFAULT 'sent',
  retries INTEGER DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- H) Admin users
CREATE TABLE public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('manager', 'employee')) NOT NULL,
  professional_id UUID REFERENCES public.professionals(id), -- Optional for employees
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- I) Basic indexes
CREATE INDEX idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX idx_bookings_professional_id ON public.bookings(professional_id);
CREATE INDEX idx_bookings_location_id ON public.bookings(location_id);
CREATE INDEX idx_bookings_start_at ON public.bookings(start_at);
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_class_sessions_start_at ON public.class_sessions(start_at);
CREATE INDEX idx_class_sessions_class_id ON public.class_sessions(class_id);
CREATE INDEX idx_vouchers_user_id ON public.vouchers(user_id);
CREATE INDEX idx_vouchers_status ON public.vouchers(status);
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- Enable RLS on user-related tables
ALTER TABLE public.users_shadow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (can be refined later)
CREATE POLICY "Users can view their own shadow record" ON public.users_shadow
  FOR SELECT USING (true); -- Public read for now

CREATE POLICY "Users can view their own bookings" ON public.bookings
  FOR SELECT USING (true); -- Public read for now

-- J) Seed data
INSERT INTO public.locations (id, name, description, address, schedule) VALUES
('11111111-1111-1111-1111-111111111111', 'Centro Principal', 'Ubicación principal del centro', 'Calle Principal 123, Madrid', 
 '{"monday": {"open": "09:00", "close": "21:00"}, "tuesday": {"open": "09:00", "close": "21:00"}, "wednesday": {"open": "09:00", "close": "21:00"}, "thursday": {"open": "09:00", "close": "21:00"}, "friday": {"open": "09:00", "close": "21:00"}, "saturday": {"open": "10:00", "close": "18:00"}, "sunday": {"closed": true}}');

INSERT INTO public.categories (id, name, description, type) VALUES
('22222222-2222-2222-2222-222222222222', 'Tratamientos Faciales', 'Cuidado y rejuvenecimiento facial', 'service'),
('33333333-3333-3333-3333-333333333333', 'Clases de Yoga', 'Sesiones de yoga y relajación', 'class');

INSERT INTO public.professionals (id, name, email, specialty, color, bio) VALUES
('44444444-4444-4444-4444-444444444444', 'Ana García', 'ana@reservaspro.com', 'Estética Facial', '#10B981', 'Especialista en tratamientos faciales con 10 años de experiencia'),
('55555555-5555-5555-5555-555555555555', 'Carlos Martín', 'carlos@reservaspro.com', 'Instructor de Yoga', '#8B5CF6', 'Instructor certificado de yoga con formación internacional');

INSERT INTO public.services (id, category_id, name, description, price, duration_min) VALUES
('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'Limpieza Facial Básica', 'Limpieza profunda con extracción y mascarilla', 45.00, 60),
('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'Tratamiento Anti-edad', 'Tratamiento completo con radiofrecuencia', 85.00, 90);

INSERT INTO public.classes (id, category_id, name, description, duration_min, capacity) VALUES
('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', 'Yoga Matutino', 'Clase de yoga energizante para empezar el día', 60, 12);

INSERT INTO public.service_professionals (service_id, professional_id) VALUES
('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444'),
('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444');

INSERT INTO public.service_locations (service_id, location_id) VALUES
('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111'),
('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111');

INSERT INTO public.class_locations (class_id, location_id) VALUES
('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111');

INSERT INTO public.class_professionals (class_id, professional_id) VALUES
('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555');

INSERT INTO public.class_sessions (id, class_id, location_id, professional_id, start_at, end_at, capacity) VALUES
('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', '2024-01-15 08:00:00+00', '2024-01-15 09:00:00+00', 12);

INSERT INTO public.voucher_types (id, name, description, sessions_count, price, validity_days) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bono 5 Sesiones Faciales', 'Pack de 5 tratamientos faciales con descuento', 5, 200.00, 180);

INSERT INTO public.voucher_type_categories (voucher_type_id, category_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222');

INSERT INTO public.subscription_plans (id, name, description, cycle, price, cap_per_cycle) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Plan Yoga Mensual', 'Acceso ilimitado a todas las clases de yoga durante un mes', 'monthly', 75.00, NULL);

INSERT INTO public.subscription_plan_categories (plan_id, category_id) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333');

INSERT INTO public.users_shadow (id, app_user_id, name, email) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'user_123', 'María López', 'maria@ejemplo.com');

-- Fixed admin_users INSERT with explicit column specification
INSERT INTO public.admin_users (id, name, email, role) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Admin Principal', 'admin@reservaspro.com', 'manager');

INSERT INTO public.admin_users (id, name, email, role, professional_id) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Ana García', 'ana@reservaspro.com', 'employee', '44444444-4444-4444-4444-444444444444');

-- Fixed settings INSERT with proper JSONB values
INSERT INTO public.settings (key, value) VALUES
('cancellation_policy_hours', '"24"'),
('branding', '{"name": "Reservas Pro", "logo_url": "", "primary_color": "#10B981"}'),
('stripe_config', '{"public_key": "", "secret_key": ""}'),
('n8n_webhook_url', '""');

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_shadow_updated_at BEFORE UPDATE ON public.users_shadow FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_professionals_updated_at BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_waitlist_updated_at BEFORE UPDATE ON public.waitlist FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_voucher_types_updated_at BEFORE UPDATE ON public.voucher_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vouchers_updated_at BEFORE UPDATE ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();