-- Allow panel admins to update bookings status and other fields
-- Create UPDATE policy on bookings for panel admins
CREATE POLICY "Panel admins can update bookings"
ON public.bookings
FOR UPDATE
USING (public.is_panel_admin())
WITH CHECK (public.is_panel_admin());
