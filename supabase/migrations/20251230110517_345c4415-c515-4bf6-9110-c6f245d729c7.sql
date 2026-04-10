-- Permitir a los administradores del panel actualizar registros de usuarios
CREATE POLICY "Panel admins can update users_shadow" 
ON public.users_shadow 
FOR UPDATE 
USING (is_panel_admin()) 
WITH CHECK (is_panel_admin());