-- Migración para sincronizar location_hours legacy a locations.business_hours
-- Corrección del flag disable_location_hours.enabled = false por defecto

-- 1. Corregir el flag de settings para que sea false por defecto
UPDATE settings 
SET value = '{"enabled": false}'::jsonb 
WHERE key = 'disable_location_hours' 
AND value->>'enabled' = 'true';

-- 2. Sincronizar datos legacy a business_hours para ubicaciones que no lo tengan
-- Primero verificamos qué ubicaciones necesitan migración
UPDATE locations 
SET business_hours = (
  -- Construir JSON con formato correcto usando índice ISO 1-7 (Lunes=1, Domingo=7)
  SELECT jsonb_object_agg(
    lh.day_of_week::text,
    CASE 
      WHEN lh.is_closed = true OR lh.open_time IS NULL OR lh.close_time IS NULL THEN 
        jsonb_build_object('open', false, 'intervals', '[]'::jsonb)
      ELSE 
        jsonb_build_object(
          'open', true, 
          'intervals', jsonb_build_array(
            jsonb_build_object(
              'start', lh.open_time::text,
              'end', lh.close_time::text
            )
          )
        )
    END
  )
  FROM location_hours lh 
  WHERE lh.location_id = locations.id
  GROUP BY lh.location_id
)
WHERE (business_hours IS NULL OR business_hours = '{}'::jsonb)
AND id IN (
  SELECT DISTINCT location_id FROM location_hours
);