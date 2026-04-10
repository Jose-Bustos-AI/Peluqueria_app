-- Add columns to locations if not exist
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS business_hours JSONB,
ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Backfill defaults safely
UPDATE public.locations
SET business_hours = COALESCE(business_hours, '[]'::jsonb),
    timezone = COALESCE(timezone, 'Europe/Madrid')
WHERE business_hours IS NULL OR timezone IS NULL;

-- Ensure settings table has the feature flag with default true
INSERT INTO public.settings (key, value)
VALUES ('disable_location_hours', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;