-- Función temporal para purga de datos de prueba
CREATE OR REPLACE FUNCTION purge_test_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log inicio
  RAISE NOTICE 'Iniciando purga de datos de prueba - %', now();
  
  -- 1. Limpiar voucher_redemptions (ya vacía pero por completitud)
  DELETE FROM voucher_redemptions;
  RAISE NOTICE 'voucher_redemptions: % filas eliminadas', (SELECT ROW_COUNT());
  
  -- 2. Limpiar bookings 
  DELETE FROM bookings;
  RAISE NOTICE 'bookings: % filas eliminadas', (SELECT ROW_COUNT());
  
  -- 3. Limpiar vouchers
  DELETE FROM vouchers;
  RAISE NOTICE 'vouchers: % filas eliminadas', (SELECT ROW_COUNT());
  
  -- 4. Limpiar users_shadow
  DELETE FROM users_shadow;
  RAISE NOTICE 'users_shadow: % filas eliminadas', (SELECT ROW_COUNT());
  
  RAISE NOTICE 'Purga completada - %', now();
END;
$$;

-- Ejecutar la purga
SELECT purge_test_data();

-- Limpiar la función temporal
DROP FUNCTION purge_test_data();