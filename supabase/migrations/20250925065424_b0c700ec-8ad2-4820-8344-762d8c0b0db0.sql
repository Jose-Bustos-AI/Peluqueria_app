-- Add field to track subscription cancellation at period end
ALTER TABLE public.subscriptions 
ADD COLUMN cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- Add comment to document the field
COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS 'Indicates if subscription is set to cancel at the end of current billing period';