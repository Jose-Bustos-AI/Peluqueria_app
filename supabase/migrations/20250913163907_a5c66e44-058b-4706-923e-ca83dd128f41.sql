-- Add RLS policies if they don't exist
DO $$
BEGIN
    -- Check if policy exists before creating
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'subscription_plan_categories' 
        AND policyname = 'Panel admins can manage subscription_plan_categories'
    ) THEN
        CREATE POLICY "Panel admins can manage subscription_plan_categories" 
        ON public.subscription_plan_categories 
        FOR ALL 
        USING (is_panel_admin()) 
        WITH CHECK (is_panel_admin());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'subscription_plan_categories' 
        AND policyname = 'Public read access to subscription_plan_categories'
    ) THEN
        CREATE POLICY "Public read access to subscription_plan_categories" 
        ON public.subscription_plan_categories 
        FOR SELECT 
        USING (true);
    END IF;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE public.subscription_plan_categories ENABLE ROW LEVEL SECURITY;

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'subscription_plan_categories_plan_id_category_id_key'
    ) THEN
        ALTER TABLE public.subscription_plan_categories 
        ADD CONSTRAINT subscription_plan_categories_plan_id_category_id_key 
        UNIQUE(plan_id, category_id);
    END IF;
END $$;

-- Make professional_id nullable in subscription_plans
ALTER TABLE public.subscription_plans 
ALTER COLUMN professional_id DROP NOT NULL;