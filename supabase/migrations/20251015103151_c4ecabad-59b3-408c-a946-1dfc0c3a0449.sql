-- Eliminar todas las reservas y usuarios de la base de datos
-- Respetar el orden de dependencias de foreign keys

-- PASO 1: Eliminar registros que dependen de bookings
DELETE FROM voucher_redemptions;

-- PASO 2: Eliminar todos los pagos (tanto de bookings como de subscriptions)
DELETE FROM payments;

-- PASO 3: Eliminar bookings
DELETE FROM bookings;

-- PASO 4: Eliminar registros relacionados con suscripciones
DELETE FROM subscription_invoices;
DELETE FROM subscriptions;

-- PASO 5: Eliminar otros registros de usuarios
DELETE FROM vouchers;
DELETE FROM waitlist;

-- PASO 6: Eliminar usuarios shadow
DELETE FROM users_shadow;