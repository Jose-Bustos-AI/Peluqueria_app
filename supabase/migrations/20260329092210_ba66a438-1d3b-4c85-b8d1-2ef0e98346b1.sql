-- Function to get the professional_id linked to the current authenticated user
CREATE OR REPLACE FUNCTION public.get_my_professional_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT professional_id
  FROM admin_users
  WHERE email = auth.email()
    AND active = true
    AND professional_id IS NOT NULL
  LIMIT 1
$$;

-- Allow professionals to update bookings assigned to them
CREATE POLICY "professionals_can_update_own_bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (professional_id = public.get_my_professional_id())
WITH CHECK (professional_id = public.get_my_professional_id());