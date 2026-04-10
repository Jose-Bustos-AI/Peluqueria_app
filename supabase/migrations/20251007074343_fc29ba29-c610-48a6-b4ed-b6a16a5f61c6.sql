-- Borrar datos de prueba en el orden correcto para respetar foreign keys

-- 1. Borrar redemptions de bonos (depende de vouchers y bookings)
DELETE FROM voucher_redemptions;

-- 2. Borrar reembolsos (depende de payments)
DELETE FROM refunds;

-- 3. Borrar pagos (depende de bookings y subscription_invoices)
DELETE FROM payments;

-- 4. Borrar reservas (ahora sin dependencias)
DELETE FROM bookings;

-- 5. Borrar facturas de suscripciones (ahora sin dependencias)
DELETE FROM subscription_invoices;

-- 6. Borrar suscripciones
DELETE FROM subscriptions;

-- 7. Borrar bonos
DELETE FROM vouchers;

-- 8. Borrar sesiones de clases
DELETE FROM class_sessions;

-- 9. Borrar lista de espera
DELETE FROM waitlist;

-- 10. Borrar usuarios shadow
DELETE FROM users_shadow;

-- 11. Borrar webhooks salientes
DELETE FROM outbound_webhooks;

-- 12. Borrar logs de auditoría
DELETE FROM audit_logs;