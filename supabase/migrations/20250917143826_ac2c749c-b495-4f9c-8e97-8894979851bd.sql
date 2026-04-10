-- Función temporal para eliminar pagos pendientes
CREATE OR REPLACE FUNCTION purge_pending_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  -- Log inicio
  RAISE NOTICE 'Eliminando pagos pendientes - %', now();
  
  -- Limpiar refunds (por dependencias)
  DELETE FROM refunds;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RAISE NOTICE 'refunds: % filas eliminadas', rows_affected;
  
  -- Limpiar payments
  DELETE FROM payments;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RAISE NOTICE 'payments: % filas eliminadas', rows_affected;
  
  -- Limpiar subscription_invoices
  DELETE FROM subscription_invoices;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RAISE NOTICE 'subscription_invoices: % filas eliminadas', rows_affected;
  
  RAISE NOTICE 'Purga de pagos completada - %', now();
END;
$$;

-- Ejecutar la purga
SELECT purge_pending_payments();

-- Limpiar la función temporal
DROP FUNCTION purge_pending_payments();