-- Limpieza de datos de prueba (respetando FKs)
BEGIN;

-- Pagos y reembolsos
DELETE FROM refunds;
DELETE FROM payments;

-- Suscripciones
DELETE FROM subscription_invoices;
DELETE FROM subscriptions;

-- Bonos / redenciones
DELETE FROM voucher_redemptions;

-- Bonos de prueba (descomenta si quieres borrar también los vouchers)
-- DELETE FROM vouchers;

-- Reservas
DELETE FROM bookings;

-- Usuarios del widget no referenciados (evitar borrar admins)
DELETE FROM users_shadow us
WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.user_id = us.id)
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = us.id)
  AND NOT EXISTS (SELECT 1 FROM voucher_redemptions vr WHERE vr.user_id = us.id);

COMMIT;