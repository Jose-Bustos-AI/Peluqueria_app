-- Policies to allow panel admins to create, update and delete services and their relations
-- Keep existing public read policies intact

-- SERVICES
CREATE POLICY "Panel admins can manage services"
ON public.services
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

-- SERVICE_LOCATIONS
CREATE POLICY "Panel admins can manage service_locations"
ON public.service_locations
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

-- SERVICE_PROFESSIONALS
CREATE POLICY "Panel admins can manage service_professionals"
ON public.service_professionals
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());