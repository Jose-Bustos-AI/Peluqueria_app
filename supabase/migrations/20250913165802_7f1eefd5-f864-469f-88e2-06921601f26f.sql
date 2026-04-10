-- Ensure RLS is enabled
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Allow panel admins to manage subscription plans (insert/update/delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'subscription_plans' 
      AND policyname = 'Panel admins can manage subscription_plans'
  ) THEN
    CREATE POLICY "Panel admins can manage subscription_plans"
    ON public.subscription_plans
    FOR ALL
    USING (public.is_panel_admin())
    WITH CHECK (public.is_panel_admin());
  END IF;
END $$;

-- Allow panel admins to read all plans (including inactives)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'subscription_plans' 
      AND policyname = 'Panel admins can read all subscription_plans'
  ) THEN
    CREATE POLICY "Panel admins can read all subscription_plans"
    ON public.subscription_plans
    FOR SELECT
    USING (public.is_panel_admin());
  END IF;
END $$;