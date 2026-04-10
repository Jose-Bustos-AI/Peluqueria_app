-- Ensure RLS is enabled on locations table
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Allow panel admins to manage locations (insert/update/delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'locations' 
      AND policyname = 'Panel admins can manage locations'
  ) THEN
    CREATE POLICY "Panel admins can manage locations"
    ON public.locations
    FOR ALL
    USING (public.is_panel_admin())
    WITH CHECK (public.is_panel_admin());
  END IF;
END $$;