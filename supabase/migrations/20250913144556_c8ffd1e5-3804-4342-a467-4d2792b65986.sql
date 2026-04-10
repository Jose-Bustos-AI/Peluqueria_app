-- Add missing fields to classes table
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS price numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS default_start_time time,
ADD COLUMN IF NOT EXISTS default_end_time time,
ADD COLUMN IF NOT EXISTS days_of_week integer[] DEFAULT '{}';

-- Add RLS policies for classes management
CREATE POLICY "Panel admins can manage classes" 
ON public.classes 
FOR ALL 
USING (is_panel_admin()) 
WITH CHECK (is_panel_admin());

-- Add RLS policies for class_professionals management
CREATE POLICY "Panel admins can manage class_professionals" 
ON public.class_professionals 
FOR ALL 
USING (is_panel_admin()) 
WITH CHECK (is_panel_admin());

-- Add RLS policies for class_locations management
CREATE POLICY "Panel admins can manage class_locations" 
ON public.class_locations 
FOR ALL 
USING (is_panel_admin()) 
WITH CHECK (is_panel_admin());

-- Add RLS policies for class_sessions management
CREATE POLICY "Panel admins can manage class_sessions" 
ON public.class_sessions 
FOR ALL 
USING (is_panel_admin()) 
WITH CHECK (is_panel_admin());