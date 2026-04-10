-- Create subscription_plan_categories bridge table
CREATE TABLE public.subscription_plan_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  UNIQUE(plan_id, category_id)
);

-- Add check constraint to only allow categories with type = 'Clase'
ALTER TABLE public.subscription_plan_categories 
ADD CONSTRAINT check_category_type 
CHECK (
  EXISTS (
    SELECT 1 FROM public.categories 
    WHERE id = category_id AND type = 'class'
  )
);

-- Enable RLS
ALTER TABLE public.subscription_plan_categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Panel admins can manage subscription_plan_categories" 
ON public.subscription_plan_categories 
FOR ALL 
USING (is_panel_admin()) 
WITH CHECK (is_panel_admin());

CREATE POLICY "Public read access to subscription_plan_categories" 
ON public.subscription_plan_categories 
FOR SELECT 
USING (true);

-- Deprecate professional_id in subscription_plans (make it nullable)
ALTER TABLE public.subscription_plans 
ALTER COLUMN professional_id DROP NOT NULL;

-- Migrate existing data from subscription_plan_classes to subscription_plan_categories
INSERT INTO public.subscription_plan_categories (plan_id, category_id)
SELECT DISTINCT spc.plan_id, c.category_id
FROM public.subscription_plan_classes spc
JOIN public.classes c ON c.id = spc.class_id
WHERE c.category_id IS NOT NULL
ON CONFLICT (plan_id, category_id) DO NOTHING;