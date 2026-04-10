-- Eliminar datos relacionados con las reservas de prueba
-- Primero eliminamos refunds relacionados con payments de bookings
DELETE FROM refunds WHERE payment_id IN (
  SELECT p.id FROM payments p 
  WHERE p.booking_id IS NOT NULL
);

-- Eliminar voucher_redemptions relacionados con bookings
DELETE FROM voucher_redemptions WHERE booking_id IS NOT NULL;

-- Eliminar payments relacionados con bookings
DELETE FROM payments WHERE booking_id IS NOT NULL; 

-- Eliminar outbound_webhooks relacionados con bookings
DELETE FROM outbound_webhooks WHERE event LIKE '%booking%';

-- Finalmente eliminar todas las reservas
DELETE FROM bookings;