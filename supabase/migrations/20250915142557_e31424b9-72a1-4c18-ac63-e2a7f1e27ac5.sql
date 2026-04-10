-- Fix the user status view to handle non-UUID app_user_id values
DROP VIEW IF EXISTS public.user_status_vw;

CREATE OR REPLACE VIEW public.user_status_vw AS
SELECT
  u.id                                AS user_id,
  u.name                              AS name,
  u.email                             AS email,
  u.created_at                        AS created_at,
  u.app_user_id                       AS app_user_id,
  MAX(b.start_at)                     AS last_booking_at,
  COALESCE(DATE_PART('day', NOW() - MAX(b.start_at)), 999999)::INT AS days_since_last_booking,
  EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = u.id
      AND s.status = 'active'
      AND s.next_billing_date >= NOW()
  )                                   AS has_active_subscription,
  EXISTS (
    SELECT 1
    FROM public.vouchers v
    WHERE v.user_id = u.id
      AND v.status = 'active'
      AND (v.expiry_date IS NULL OR v.expiry_date >= NOW())
      AND COALESCE(v.sessions_remaining, 1) > 0
  )                                   AS has_active_voucher
FROM public.users_shadow u
LEFT JOIN public.bookings b ON b.user_id = u.id
GROUP BY u.id, u.name, u.email, u.created_at, u.app_user_id;

-- Grant access to the view
GRANT SELECT ON public.user_status_vw TO authenticated;
GRANT SELECT ON public.user_status_vw TO anon;