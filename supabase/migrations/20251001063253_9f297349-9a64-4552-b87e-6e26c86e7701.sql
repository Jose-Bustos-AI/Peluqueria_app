-- Limpieza total de datos de pruebas: reservas, pagos/compras y usuarios
-- Orden para respetar integridad referencial

-- 1) Reembolsos (dependen de payments)
DELETE FROM refunds;

-- 2) Redenciones de bonos (dependen de bookings/vouchers)
DELETE FROM voucher_redemptions;

-- 3) Pagos (dependen de bookings o subscription_invoices)
DELETE FROM payments;

-- 4) Facturas de suscripción (dependen de subscriptions)
DELETE FROM subscription_invoices;

-- 5) Bonos/vouchers
DELETE FROM vouchers;

-- 6) Suscripciones
DELETE FROM subscriptions;

-- 7) Lista de espera
DELETE FROM waitlist;

-- 8) Reservas
DELETE FROM bookings;

-- 9) Usuarios (tabla shadow usada por el widget)
DELETE FROM users_shadow;