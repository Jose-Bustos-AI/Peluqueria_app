-- Update subscription plan cap_per_cycle
UPDATE subscription_plans 
SET cap_per_cycle = 8 
WHERE name = 'Intermedio';

-- Update all subscription bookings for bustosalmeria@gmail.com with correct subscriptionId
UPDATE bookings
SET notes = jsonb_set(
  COALESCE(notes::jsonb, '{}'::jsonb),
  '{subscriptionId}',
  to_jsonb('807be982-3e99-4ea9-8dba-88b2d3d55cce'::text)
)
WHERE user_id = (SELECT id FROM users_shadow WHERE email = 'bustosalmeria@gmail.com')
AND origin = 'subscription'
AND (notes::jsonb->>'subscriptionId' IS NULL OR notes::jsonb->>'subscriptionId' = 'null');