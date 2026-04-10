-- Add sessions_count and photo_url fields to subscription_plans table
ALTER TABLE public.subscription_plans 
ADD COLUMN sessions_count integer,
ADD COLUMN photo_url text;