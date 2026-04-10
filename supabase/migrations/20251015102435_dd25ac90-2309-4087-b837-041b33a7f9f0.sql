-- Corregir el día de la semana del domingo de 7 a 0
-- Primero eliminamos los constraints existentes, luego actualizamos los datos, y finalmente creamos nuevos constraints

-- PASO 1: Eliminar los constraints existentes para day_of_week
ALTER TABLE location_hours 
DROP CONSTRAINT IF EXISTS location_hours_day_of_week_check;

ALTER TABLE professional_hours 
DROP CONSTRAINT IF EXISTS professional_hours_day_of_week_check;

ALTER TABLE location_hours_exceptions 
DROP CONSTRAINT IF EXISTS location_hours_exceptions_day_of_week_check CASCADE;

ALTER TABLE professional_hours_exceptions 
DROP CONSTRAINT IF EXISTS professional_hours_exceptions_day_of_week_check CASCADE;

-- PASO 2: Actualizar los datos de 7 a 0 (domingo)
UPDATE location_hours 
SET day_of_week = 0 
WHERE day_of_week = 7;

UPDATE professional_hours 
SET day_of_week = 0 
WHERE day_of_week = 7;

-- PASO 3: Crear nuevos constraints con el rango correcto (0-6)
-- 0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado
ALTER TABLE location_hours 
ADD CONSTRAINT location_hours_day_of_week_check 
CHECK (day_of_week >= 0 AND day_of_week <= 6);

ALTER TABLE professional_hours 
ADD CONSTRAINT professional_hours_day_of_week_check 
CHECK (day_of_week >= 0 AND day_of_week <= 6);

-- Nota: Las tablas de excepciones no tienen day_of_week, solo date
-- por lo que no necesitan constraint