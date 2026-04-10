
-- Limpiar todas las reservas y usuarios de la base de datos
-- Se borran en orden para evitar violaciones de claves foráneas

-- 1. Borrar dependencias de nivel más profundo
DELETE FROM voucher_redemptions;
DELETE FROM subscription_invoices;
DELETE FROM refunds;
DELETE FROM payments;
DELETE FROM waitlist;

-- 2. Borrar reservas
DELETE FROM bookings;

-- 3. Borrar bonos y suscripciones
DELETE FROM vouchers;
DELETE FROM subscriptions;

-- 4. Borrar tabla de usuarios shadow
DELETE FROM users_shadow;

-- 5. Borrar webhooks salientes
DELETE FROM outbound_webhooks;
