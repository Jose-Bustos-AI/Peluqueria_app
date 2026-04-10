-- Add allowed_sections field to admin_users table
ALTER TABLE public.admin_users 
ADD COLUMN allowed_sections TEXT[] DEFAULT NULL;

-- Create role_templates table for reusable role definitions
CREATE TABLE public.role_templates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    allowed_sections TEXT[] NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on role_templates
ALTER TABLE public.role_templates ENABLE ROW LEVEL SECURITY;

-- Create policies for role_templates (admin access only)
CREATE POLICY "Admin access on role_templates" 
ON public.role_templates 
FOR ALL 
USING (true);

-- Add trigger for role_templates updated_at
CREATE TRIGGER update_role_templates_updated_at
BEFORE UPDATE ON public.role_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default role templates
INSERT INTO public.role_templates (name, description, allowed_sections) VALUES
('Superadmin', 'Acceso completo a todas las secciones', ARRAY[
    'dashboard', 'calendar', 'bookings', 'users', 'locations', 'categories', 
    'services', 'classes', 'professionals', 'vouchers', 'subscriptions', 
    'payments', 'reports', 'notifications', 'settings', 'audit', 'roles'
]),
('Gerente', 'Acceso de gestión sin configuración del sistema', ARRAY[
    'dashboard', 'calendar', 'bookings', 'users', 'locations', 'categories',
    'services', 'classes', 'professionals', 'vouchers', 'subscriptions',
    'payments', 'reports', 'roles'
]),
('Recepción', 'Gestión de reservas y clientes', ARRAY[
    'dashboard', 'calendar', 'bookings', 'users', 'services', 'classes'
]),
('Instructor', 'Acceso básico para profesionales', ARRAY[
    'dashboard', 'calendar', 'bookings'
]);

-- Update existing admin_users to have full access (backwards compatibility)
UPDATE public.admin_users 
SET allowed_sections = ARRAY[
    'dashboard', 'calendar', 'bookings', 'users', 'locations', 'categories',
    'services', 'classes', 'professionals', 'vouchers', 'subscriptions',
    'payments', 'reports', 'notifications', 'settings', 'audit', 'roles'
]
WHERE allowed_sections IS NULL;