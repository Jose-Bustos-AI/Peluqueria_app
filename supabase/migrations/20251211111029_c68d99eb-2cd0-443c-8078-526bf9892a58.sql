-- Add phone column to users_shadow
ALTER TABLE public.users_shadow 
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Drop and recreate the view to include phone
DROP VIEW IF EXISTS public.user_status_vw;

CREATE VIEW public.user_status_vw AS
SELECT 
  u.id AS user_id,
  u.app_user_id,
  u.name,
  u.email,
  u.phone,
  u.created_at,
  (
    SELECT MAX(b.start_at)
    FROM bookings b
    WHERE b.user_id = u.id AND b.status != 'cancelled'
  ) AS last_booking_at,
  (
    SELECT EXTRACT(DAY FROM (NOW() - MAX(b.start_at)))::INTEGER
    FROM bookings b
    WHERE b.user_id = u.id AND b.status != 'cancelled'
  ) AS days_since_last_booking,
  EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id AND s.status = 'active'
  ) AS has_active_subscription,
  EXISTS (
    SELECT 1 FROM vouchers v
    WHERE v.user_id = u.id AND v.status = 'active' AND v.sessions_remaining > 0
  ) AS has_active_voucher
FROM users_shadow u;