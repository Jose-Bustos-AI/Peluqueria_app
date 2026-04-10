-- Limpiar todos los datos de prueba de reservas y pagos
DELETE FROM voucher_redemptions WHERE booking_id IS NOT NULL;
DELETE FROM payments WHERE booking_id IS NOT NULL;
DELETE FROM bookings;