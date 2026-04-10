-- Crear función helper para verificar si el usuario es admin del panel
CREATE OR REPLACE FUNCTION is_panel_admin()
RETURNS boolean 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE email = auth.email()
      AND active = true
      AND role IN ('superadmin', 'manager')
  );
$$;

-- Crear políticas RLS para professionals
-- Política UPDATE: Solo admins del panel pueden actualizar
DROP POLICY IF EXISTS "Panel admins can update professionals" ON professionals;
CREATE POLICY "Panel admins can update professionals"
ON professionals
FOR UPDATE
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

-- Política INSERT: Solo admins del panel pueden crear
DROP POLICY IF EXISTS "Panel admins can insert professionals" ON professionals;
CREATE POLICY "Panel admins can insert professionals"
ON professionals
FOR INSERT
TO authenticated
WITH CHECK (is_panel_admin());

-- Política DELETE: Solo admins del panel pueden eliminar
DROP POLICY IF EXISTS "Panel admins can delete professionals" ON professionals;
CREATE POLICY "Panel admins can delete professionals"
ON professionals
FOR DELETE
TO authenticated
USING (is_panel_admin());