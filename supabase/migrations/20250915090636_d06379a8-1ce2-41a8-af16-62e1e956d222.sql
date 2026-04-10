-- Create professional_hours table
CREATE TABLE public.professional_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
  open_time time without time zone NOT NULL,
  close_time time without time zone NOT NULL,
  is_closed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create professional_hours_exceptions table
CREATE TABLE public.professional_hours_exceptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  date date NOT NULL,
  open_time time without time zone,
  close_time time without time zone,
  is_closed boolean DEFAULT false,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Add timezone field to professionals table
ALTER TABLE public.professionals 
ADD COLUMN timezone text DEFAULT 'Europe/Madrid';

-- Add business_hours jsonb field to professionals table
ALTER TABLE public.professionals 
ADD COLUMN business_hours jsonb;

-- Create indexes for performance
CREATE INDEX idx_professional_hours_professional_id ON public.professional_hours(professional_id);
CREATE INDEX idx_professional_hours_day_of_week ON public.professional_hours(day_of_week);
CREATE INDEX idx_professional_hours_exceptions_professional_id ON public.professional_hours_exceptions(professional_id);
CREATE INDEX idx_professional_hours_exceptions_date ON public.professional_hours_exceptions(date);

-- Enable RLS
ALTER TABLE public.professional_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_hours_exceptions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for professional_hours
CREATE POLICY "Panel admins can manage professional_hours"
ON public.professional_hours
FOR ALL 
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

CREATE POLICY "Public read access to professional_hours"
ON public.professional_hours
FOR SELECT
USING (true);

-- Create RLS policies for professional_hours_exceptions  
CREATE POLICY "Panel admins can manage professional_hours_exceptions"
ON public.professional_hours_exceptions
FOR ALL
USING (is_panel_admin())
WITH CHECK (is_panel_admin());

CREATE POLICY "Public read access to professional_hours_exceptions"
ON public.professional_hours_exceptions
FOR SELECT
USING (true);

-- Create trigger for updating updated_at
CREATE TRIGGER update_professional_hours_updated_at
BEFORE UPDATE ON public.professional_hours
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_professional_hours_exceptions_updated_at
BEFORE UPDATE ON public.professional_hours_exceptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();