-- Actualizar URL del webhook a producción
UPDATE public.settings
SET value = '"https://n8n-n8ninnovagastro.zk6hny.easypanel.host/webhook/5d254150-f0e9-4f79-a89c-34d8b33bd559"'
WHERE key = 'webhooks.booking_created_url';