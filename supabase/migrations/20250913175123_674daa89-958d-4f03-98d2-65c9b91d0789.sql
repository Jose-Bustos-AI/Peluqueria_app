-- Create location_hours table for weekly schedules
CREATE TABLE public.location_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7), -- 1=Monday, 7=Sunday
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT valid_hours CHECK (open_time < close_time OR is_closed = true)
);

-- Create location_hours_exceptions table for special dates
CREATE TABLE public.location_hours_exceptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  open_time TIME NULL,
  close_time TIME NULL,
  is_closed BOOLEAN DEFAULT false,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT valid_exception_hours CHECK (
    (is_closed = true) OR 
    (open_time IS NOT NULL AND close_time IS NOT NULL AND open_time < close_time)
  ),
  UNIQUE(location_id, date)
);

-- Enable RLS
ALTER TABLE public.location_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_hours_exceptions ENABLE ROW LEVEL SECURITY;

-- Create policies for location_hours
CREATE POLICY "Panel admins can manage location_hours" 
ON public.location_hours 
FOR ALL 
USING (is_panel_admin()) 
WITH CHECK (is_panel_admin());

CREATE POLICY "Public read access to location_hours" 
ON public.location_hours 
FOR SELECT 
USING (true);

-- Create policies for location_hours_exceptions  
CREATE POLICY "Panel admins can manage location_hours_exceptions" 
ON public.location_hours_exceptions 
FOR ALL 
USING (is_panel_admin()) 
WITH CHECK (is_panel_admin());

CREATE POLICY "Public read access to location_hours_exceptions" 
ON public.location_hours_exceptions 
FOR SELECT 
USING (true);

-- Create indexes for better performance
CREATE INDEX idx_location_hours_location_day ON public.location_hours(location_id, day_of_week);
CREATE INDEX idx_location_hours_exceptions_location_date ON public.location_hours_exceptions(location_id, date);

-- Create triggers for updated_at
CREATE TRIGGER update_location_hours_updated_at
  BEFORE UPDATE ON public.location_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_location_hours_exceptions_updated_at
  BEFORE UPDATE ON public.location_hours_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();