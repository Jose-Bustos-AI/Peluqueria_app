-- Limpiar todos los datos de prueba sin afectar las tablas
-- El orden es importante debido a las foreign keys

-- 1. Limpiar redemptions de bonos
DELETE FROM voucher_redemptions;

-- 2. Limpiar reembolsos
DELETE FROM refunds;

-- 3. Limpiar pagos
DELETE FROM payments;

-- 4. Limpiar reservas
DELETE FROM bookings;

-- 5. Limpiar facturas de suscripciones
DELETE FROM subscription_invoices;

-- 6. Limpiar suscripciones
DELETE FROM subscriptions;

-- 7. Limpiar bonos comprados
DELETE FROM vouchers;

-- 8. Limpiar usuarios registrados
DELETE FROM users_shadow;

-- 9. Limpiar lista de espera
DELETE FROM waitlist;

-- 10. Limpiar logs de auditoría
DELETE FROM audit_logs;

-- 11. Limpiar webhooks salientes
DELETE FROM outbound_webhooks;