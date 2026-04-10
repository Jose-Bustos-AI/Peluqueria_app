-- Add web.show_plans setting if it doesn't exist
INSERT INTO public.settings (key, value)
VALUES ('web.show_plans', 'true')
ON CONFLICT (key) DO NOTHING;