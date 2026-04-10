-- Add RLS policies for admin management of categories
CREATE POLICY "Admin users can manage categories"
ON public.categories
FOR ALL
TO authenticated
USING (is_panel_admin())
WITH CHECK (is_panel_admin());