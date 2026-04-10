-- Add photo_url column to locations table
ALTER TABLE public.locations 
ADD COLUMN photo_url text;