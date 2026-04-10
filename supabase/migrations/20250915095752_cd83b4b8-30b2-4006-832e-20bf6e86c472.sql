-- Add default webhook settings for booking creation
INSERT INTO settings (key, value) VALUES 
  ('webhooks.booking_created_url', '"https://n8n-n8ninnovagastro.zk6hny.easypanel.host/webhook-test/5d254150-f0e9-4f79-a89c-34d8b33bd559"'),
  ('webhooks.enabled', 'true')
ON CONFLICT (key) DO NOTHING;