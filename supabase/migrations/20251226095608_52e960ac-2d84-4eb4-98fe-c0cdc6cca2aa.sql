-- Revocar acceso anónimo a vistas de reporting
-- Esto cierra la fuga de datos sin afectar el widget ni el panel admin

REVOKE SELECT ON public.vw_bookings_complete FROM anon;
REVOKE SELECT ON public.vw_bookings_daily FROM anon;
REVOKE SELECT ON public.vw_bookings_monthly FROM anon;
REVOKE SELECT ON public.vw_revenue_confirmed FROM anon;
REVOKE SELECT ON public.vw_revenue_projected FROM anon;
REVOKE SELECT ON public.vw_vouchers_daily FROM anon;
REVOKE SELECT ON public.vw_voucher_redemptions_daily FROM anon;
REVOKE SELECT ON public.vw_subscriptions_monthly FROM anon;
REVOKE SELECT ON public.vw_subscriptions_mrr FROM anon;
REVOKE SELECT ON public.user_status_vw FROM anon;