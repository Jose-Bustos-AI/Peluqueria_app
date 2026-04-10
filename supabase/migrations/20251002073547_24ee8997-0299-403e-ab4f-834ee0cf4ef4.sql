
-- Limpiar datos de prueba manteniendo la estructura de las tablas

-- 1. Borrar redemptions (depende de vouchers y bookings)
DELETE FROM voucher_redemptions;

-- 2. Borrar refunds (depende de payments)
DELETE FROM refunds;

-- 3. Borrar payments (depende de bookings y subscriptions)
DELETE FROM payments;

-- 4. Borrar subscription invoices (depende de subscriptions)
DELETE FROM subscription_invoices;

-- 5. Borrar bookings
DELETE FROM bookings;

-- 6. Borrar waitlist
DELETE FROM waitlist;

-- 7. Borrar subscriptions (depende de users)
DELETE FROM subscriptions;

-- 8. Borrar vouchers (depende de users)
DELETE FROM vouchers;

-- 9. Borrar outbound webhooks (logs de eventos)
DELETE FROM outbound_webhooks;

-- 10. Finalmente borrar usuarios
DELETE FROM users_shadow;

-- Confirmar limpieza
SELECT 
  (SELECT COUNT(*) FROM bookings) as bookings_restantes,
  (SELECT COUNT(*) FROM vouchers) as vouchers_restantes,
  (SELECT COUNT(*) FROM users_shadow) as usuarios_restantes,
  (SELECT COUNT(*) FROM voucher_redemptions) as redemptions_restantes,
  (SELECT COUNT(*) FROM payments) as payments_restantes,
  (SELECT COUNT(*) FROM subscriptions) as subscriptions_restantes;
