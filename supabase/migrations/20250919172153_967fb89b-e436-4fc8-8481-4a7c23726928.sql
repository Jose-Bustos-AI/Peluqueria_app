-- Limpieza de datos de prueba (respetando FKs) - CORREGIDA v2
BEGIN;

-- Pagos y reembolsos
DELETE FROM refunds;
DELETE FROM payments;

-- Suscripciones  
DELETE FROM subscription_invoices;
DELETE FROM subscriptions;

-- Bonos / redenciones
DELETE FROM voucher_redemptions;

-- Bonos de prueba (mantengo comentado para conservar vouchers de catálogo)
-- DELETE FROM vouchers;

-- Reservas
DELETE FROM bookings;

-- Usuarios del widget no referenciados (incluyo vouchers para respetar FK)
DELETE FROM users_shadow us
WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.user_id = us.id)
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = us.id)
  AND NOT EXISTS (SELECT 1 FROM vouchers v WHERE v.user_id = us.id);

COMMIT;