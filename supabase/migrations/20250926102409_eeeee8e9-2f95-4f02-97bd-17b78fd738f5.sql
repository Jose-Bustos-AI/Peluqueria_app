-- Add missing foreign key constraints to service_professionals table
ALTER TABLE public.service_professionals 
ADD CONSTRAINT fk_service_professionals_service_id 
FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

ALTER TABLE public.service_professionals 
ADD CONSTRAINT fk_service_professionals_professional_id 
FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE CASCADE;