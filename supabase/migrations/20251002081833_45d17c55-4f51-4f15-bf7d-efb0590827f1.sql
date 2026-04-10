-- Limpiar todos los datos de la base de datos (manteniendo estructura de tablas)

-- Eliminar redenciones de bonos
DELETE FROM voucher_redemptions;

-- Eliminar lista de espera
DELETE FROM waitlist;

-- Eliminar reservas
DELETE FROM bookings;

-- Eliminar reembolsos
DELETE FROM refunds;

-- Eliminar pagos
DELETE FROM payments;

-- Eliminar facturas de suscripciones
DELETE FROM subscription_invoices;

-- Eliminar suscripciones
DELETE FROM subscriptions;

-- Eliminar bonos
DELETE FROM vouchers;

-- Eliminar webhooks salientes
DELETE FROM outbound_webhooks;

-- Eliminar logs de auditoría
DELETE FROM audit_logs;

-- Eliminar usuarios sombra (último porque otros dependen de esto)
DELETE FROM users_shadow;