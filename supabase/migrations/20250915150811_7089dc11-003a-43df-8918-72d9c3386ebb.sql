-- Fix analytics views to show real data with correct status values and date calculations

-- 1) Fix bookings daily view - use created_at and correct status values
DROP VIEW IF EXISTS public.vw_bookings_daily;
CREATE OR REPLACE VIEW public.vw_bookings_daily AS
SELECT
  date_trunc('day', (b.created_at AT TIME ZONE COALESCE(l.timezone, 'Europe/Madrid')))::date AS day_local,
  b.location_id,
  COUNT(*) AS bookings_created,
  COUNT(*) FILTER (WHERE b.status IN ('completed', 'confirmed')) AS bookings_confirmed,
  COUNT(*) FILTER (WHERE b.status = 'cancelled') AS bookings_cancelled
FROM public.bookings b
JOIN public.locations l ON l.id = b.location_id
GROUP BY 1, 2;

-- 2) Fix bookings monthly view - use created_at
DROP VIEW IF EXISTS public.vw_bookings_monthly;
CREATE OR REPLACE VIEW public.vw_bookings_monthly AS
SELECT
  date_trunc('month', (b.created_at AT TIME ZONE COALESCE(l.timezone, 'Europe/Madrid')))::date AS month_local,
  b.location_id,
  COUNT(*) AS bookings_created,
  COUNT(*) FILTER (WHERE b.status IN ('completed', 'confirmed')) AS bookings_confirmed
FROM public.bookings b
JOIN public.locations l ON l.id = b.location_id
GROUP BY 1, 2;

-- 3) Revenue confirmed - use payments table with fallback to service pricing
DROP VIEW IF EXISTS public.vw_revenue_confirmed;
CREATE OR REPLACE VIEW public.vw_revenue_confirmed AS
SELECT
  date_trunc('day', (COALESCE(p.created_at, b.created_at) AT TIME ZONE COALESCE(l.timezone, 'Europe/Madrid')))::date AS day_local,
  b.location_id,
  SUM(COALESCE(p.amount, s.price, 0)) AS revenue_confirmed
FROM public.bookings b
JOIN public.locations l ON l.id = b.location_id
LEFT JOIN public.services s ON s.id = b.service_id
LEFT JOIN public.payments p ON p.booking_id = b.id AND p.status = 'succeeded'
WHERE b.payment_status = 'paid' OR p.status = 'succeeded'
GROUP BY 1, 2;

-- 4) Revenue projected - bookings with confirmed/completed status but unpaid
DROP VIEW IF EXISTS public.vw_revenue_projected;
CREATE OR REPLACE VIEW public.vw_revenue_projected AS
SELECT
  date_trunc('day', (b.created_at AT TIME ZONE COALESCE(l.timezone, 'Europe/Madrid')))::date AS day_local,
  b.location_id,
  SUM(COALESCE(s.price, 0)) AS revenue_projected
FROM public.bookings b
JOIN public.locations l ON l.id = b.location_id
LEFT JOIN public.services s ON s.id = b.service_id
WHERE b.status IN ('completed', 'confirmed', 'pending')
  AND COALESCE(b.payment_status, 'unpaid') IN ('unpaid', 'partial')
GROUP BY 1, 2;

-- 5) Fix vouchers daily view - use purchase_date and connect to default location if needed
DROP VIEW IF EXISTS public.vw_vouchers_daily;
CREATE OR REPLACE VIEW public.vw_vouchers_daily AS
SELECT
  date_trunc('day', (v.purchase_date AT TIME ZONE 'Europe/Madrid'))::date AS day_local,
  COALESCE((SELECT id FROM public.locations ORDER BY created_at LIMIT 1)) AS location_id,
  COUNT(*) AS vouchers_sold
FROM public.vouchers v
WHERE v.status = 'active'
GROUP BY 1, 2;

-- Keep other views as they were since they depend on data that might not exist yet
-- Grant permissions again for the updated views
GRANT SELECT ON public.vw_bookings_daily,
                 public.vw_bookings_monthly,
                 public.vw_revenue_confirmed,
                 public.vw_revenue_projected,
                 public.vw_vouchers_daily
TO anon, authenticated;