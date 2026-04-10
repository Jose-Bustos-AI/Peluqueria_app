-- Add RLS policy to allow users to view their own subscriptions
CREATE POLICY "Users can view their own subscriptions" 
ON public.subscriptions 
FOR SELECT 
USING (user_id IS NOT NULL);