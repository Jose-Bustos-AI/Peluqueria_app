-- Create comprehensive business analytics views

-- 1) Bookings daily view (created/confirmed/cancelled) by date local
CREATE OR REPLACE VIEW public.vw_bookings_daily AS
SELECT
  date_trunc('day', (b.start_at AT TIME ZONE COALESCE(l.timezone, 'Europe/Madrid')))::date AS day_local,
  b.location_id,
  COUNT(*) AS bookings_created,
  COUNT(*) FILTER (WHERE b.status = 'confirmed') AS bookings_confirmed,
  COUNT(*) FILTER (WHERE b.status = 'cancelled') AS bookings_cancelled
FROM public.bookings b
JOIN public.locations l ON l.id = b.location_id
GROUP BY 1, 2;

-- 2) Bookings monthly for trends (last 6 months)
CREATE OR REPLACE VIEW public.vw_bookings_monthly AS
SELECT
  date_trunc('month', (b.start_at AT TIME ZONE COALESCE(l.timezone, 'Europe/Madrid')))::date AS month_local,
  b.location_id,
  COUNT(*) AS bookings_created,
  COUNT(*) FILTER (WHERE b.status = 'confirmed') AS bookings_confirmed
FROM public.bookings b
JOIN public.locations l ON l.id = b.location_id
GROUP BY 1, 2;

-- 3) Revenue confirmed (from payments)
CREATE OR REPLACE VIEW public.vw_revenue_confirmed AS
SELECT
  date_trunc('day', (p.created_at AT TIME ZONE COALESCE(l.timezone, 'Europe/Madrid')))::date AS day_local,
  b.location_id,
  SUM(p.amount) AS revenue_confirmed
FROM public.payments p
JOIN public.bookings b ON b.id = p.booking_id
JOIN public.locations l ON l.id = b.location_id
WHERE p.status = 'succeeded'
GROUP BY 1, 2;

-- 4) Revenue projected (confirmed bookings pending payment)
CREATE OR REPLACE VIEW public.vw_revenue_projected AS
SELECT
  date_trunc('day', (b.start_at AT TIME ZONE COALESCE(l.timezone, 'Europe/Madrid')))::date AS day_local,
  b.location_id,
  SUM(COALESCE(s.price, 0)) AS revenue_projected
FROM public.bookings b
JOIN public.locations l ON l.id = b.location_id
LEFT JOIN public.services s ON s.id = b.service_id
WHERE b.status = 'confirmed'
  AND COALESCE(b.payment_status, 'unpaid') IN ('unpaid', 'partial')
GROUP BY 1, 2;

-- 5) Vouchers sold daily (use booking location as reference)
CREATE OR REPLACE VIEW public.vw_vouchers_daily AS
SELECT
  date_trunc('day', (v.created_at AT TIME ZONE 'Europe/Madrid'))::date AS day_local,
  COALESCE(b.location_id, (SELECT id FROM public.locations ORDER BY created_at LIMIT 1)) AS location_id,
  COUNT(*) AS vouchers_sold
FROM public.vouchers v
LEFT JOIN public.bookings b ON b.user_id = v.user_id AND b.created_at >= v.created_at - INTERVAL '1 day' AND b.created_at <= v.created_at + INTERVAL '1 day'
GROUP BY 1, 2;

-- 6) Voucher redemptions daily
CREATE OR REPLACE VIEW public.vw_voucher_redemptions_daily AS
SELECT
  date_trunc('day', (vr.created_at AT TIME ZONE 'Europe/Madrid'))::date AS day_local,
  b.location_id,
  COUNT(*) AS vouchers_redeemed,
  SUM(COALESCE(vr.credits_used, 1)) AS credits_used
FROM public.voucher_redemptions vr
JOIN public.bookings b ON b.id = vr.booking_id
GROUP BY 1, 2;

-- 7) Subscriptions monthly (new/cancelled)
CREATE OR REPLACE VIEW public.vw_subscriptions_monthly AS
SELECT
  date_trunc('month', (s.created_at AT TIME ZONE 'Europe/Madrid'))::date AS month_local,
  COALESCE((SELECT id FROM public.locations ORDER BY created_at LIMIT 1)) AS location_id,
  COUNT(*) FILTER (WHERE s.status IN ('active', 'trialing')) AS subs_new,
  COUNT(*) FILTER (WHERE s.status = 'cancelled') AS subs_cancelled
FROM public.subscriptions s
GROUP BY 1, 2;

-- 8) Current MRR from active subscriptions
CREATE OR REPLACE VIEW public.vw_subscriptions_mrr AS
SELECT
  COALESCE((SELECT id FROM public.locations ORDER BY created_at LIMIT 1)) AS location_id,
  SUM(COALESCE(sp.price, 0)) AS mrr
FROM public.subscriptions s
JOIN public.subscription_plans sp ON sp.id = s.plan_id
WHERE s.status = 'active'
  AND s.next_billing_date >= NOW()
GROUP BY 1;

-- Grant SELECT permissions
GRANT SELECT ON public.vw_bookings_daily,
                 public.vw_bookings_monthly,
                 public.vw_revenue_confirmed,
                 public.vw_revenue_projected,
                 public.vw_vouchers_daily,
                 public.vw_voucher_redemptions_daily,
                 public.vw_subscriptions_monthly,
                 public.vw_subscriptions_mrr
TO anon, authenticated;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_location_start_at ON public.bookings(location_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON public.bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_booking_status ON public.payments(booking_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_vouchers_created_at ON public.vouchers(created_at);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_created_at ON public.voucher_redemptions(created_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_created_at ON public.subscriptions(status, created_at);