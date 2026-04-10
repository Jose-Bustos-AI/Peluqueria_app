-- Update revenue confirmed logic to treat completed/confirmed as confirmed revenue
DROP VIEW IF EXISTS public.vw_revenue_confirmed;
CREATE OR REPLACE VIEW public.vw_revenue_confirmed AS
WITH booking_amounts AS (
  SELECT
    b.id AS booking_id,
    b.location_id,
    date_trunc('day', (b.created_at AT TIME ZONE COALESCE(l.timezone, 'Europe/Madrid')))::date AS day_local,
    COALESCE(
      NULLIF(SUM(CASE WHEN p.status = 'succeeded' THEN p.amount ELSE 0 END), 0),
      s.price,
      0
    ) AS amount
  FROM public.bookings b
  JOIN public.locations l ON l.id = b.location_id
  LEFT JOIN public.services s ON s.id = b.service_id
  LEFT JOIN public.payments p ON p.booking_id = b.id
  WHERE b.status IN ('completed', 'confirmed')
  GROUP BY b.id, b.location_id, day_local, s.price
)
SELECT day_local, location_id, SUM(amount) AS revenue_confirmed
FROM booking_amounts
GROUP BY day_local, location_id;

GRANT SELECT ON public.vw_revenue_confirmed TO anon, authenticated;