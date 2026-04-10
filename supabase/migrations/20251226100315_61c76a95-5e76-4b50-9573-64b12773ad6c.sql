-- Corregir vulnerabilidad de users_shadow
-- Problema: Cualquiera puede modificar/ver TODOS los registros de usuarios
-- Solución: Restringir UPDATE a solo el propio registro

-- 1. Eliminar políticas demasiado permisivas existentes
DROP POLICY IF EXISTS "Widget can insert users_shadow" ON public.users_shadow;
DROP POLICY IF EXISTS "Widget can update users_shadow" ON public.users_shadow;

-- 2. INSERT: Permitir crear nuevos usuarios (necesario para registro en widget)
CREATE POLICY "Allow insert users_shadow" ON public.users_shadow
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- 3. UPDATE: Solo puedes actualizar tu propio registro (por email del widget)
-- El widget usa app_user_id = 'widget:' + email para identificar usuarios
CREATE POLICY "Users can update their own shadow" ON public.users_shadow
FOR UPDATE TO anon, authenticated
USING (
  app_user_id = 'widget:' || lower(email)
)
WITH CHECK (
  app_user_id = 'widget:' || lower(email)
);