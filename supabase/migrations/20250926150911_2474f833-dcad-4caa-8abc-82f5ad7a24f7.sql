-- Allow users to update their own bookings (for cancellation)
CREATE POLICY "Users can update their own bookings for cancellation" 
ON public.bookings 
FOR UPDATE 
USING (auth.uid() = user_id AND status != 'cancelled') 
WITH CHECK (auth.uid() = user_id);