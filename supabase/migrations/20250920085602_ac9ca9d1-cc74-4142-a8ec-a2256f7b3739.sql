-- Eliminar todos los vouchers y usuarios de prueba
BEGIN;

-- Eliminar todos los vouchers
DELETE FROM vouchers;

-- Eliminar usuarios que no tengan reservas, suscripciones ni otros datos
DELETE FROM users_shadow us
WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.user_id = us.id)
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = us.id);

COMMIT;