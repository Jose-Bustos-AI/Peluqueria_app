-- Policies to allow panel admins to create, update and delete services and their relations
-- Keep existing public read policies intact

-- SERVICES
CREATE POLICY IF NOT EXISTS "Panel admins can manage services"
ON public.services
AS PERMISSIVE
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

-- SERVICE_LOCATIONS
CREATE POLICY IF NOT EXISTS "Panel admins can manage service_locations"
ON public.service_locations
AS PERMISSIVE
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

-- SERVICE_PROFESSIONALS
CREATE POLICY IF NOT EXISTS "Panel admins can manage service_professionals"
ON public.service_professionals
AS PERMISSIVE
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());