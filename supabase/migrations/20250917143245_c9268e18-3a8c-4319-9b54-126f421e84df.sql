-- Función temporal para purga de datos de prueba (corregida)
CREATE OR REPLACE FUNCTION purge_test_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  -- Log inicio
  RAISE NOTICE 'Iniciando purga de datos de prueba - %', now();
  
  -- 1. Limpiar voucher_redemptions 
  DELETE FROM voucher_redemptions;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RAISE NOTICE 'voucher_redemptions: % filas eliminadas', rows_affected;
  
  -- 2. Limpiar bookings 
  DELETE FROM bookings;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RAISE NOTICE 'bookings: % filas eliminadas', rows_affected;
  
  -- 3. Limpiar vouchers
  DELETE FROM vouchers;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RAISE NOTICE 'vouchers: % filas eliminadas', rows_affected;
  
  -- 4. Limpiar users_shadow
  DELETE FROM users_shadow;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RAISE NOTICE 'users_shadow: % filas eliminadas', rows_affected;
  
  RAISE NOTICE 'Purga completada - %', now();
END;
$$;

-- Ejecutar la purga
SELECT purge_test_data();

-- Limpiar la función temporal
DROP FUNCTION purge_test_data();