-- Limpiar datos de prueba - NO se modifican las tablas, solo se eliminan los datos
-- Orden correcto respetando foreign keys

-- 1. Eliminar canjes de vouchers (depende de vouchers y bookings)
DELETE FROM voucher_redemptions;

-- 2. Eliminar pagos PRIMERO (depende de bookings y subscription_invoices)
DELETE FROM payments;

-- 3. Eliminar facturas de suscripción (ahora que payments ya no las referencia)
DELETE FROM subscription_invoices;

-- 4. Eliminar reservas
DELETE FROM bookings;

-- 5. Eliminar lista de espera
DELETE FROM waitlist;

-- 6. Eliminar suscripciones
DELETE FROM subscriptions;

-- 7. Eliminar vouchers/bonos
DELETE FROM vouchers;

-- 8. Eliminar usuarios shadow
DELETE FROM users_shadow;

-- 9. Eliminar webhooks salientes
DELETE FROM outbound_webhooks;

-- 10. Eliminar refunds si existen
DELETE FROM refunds;