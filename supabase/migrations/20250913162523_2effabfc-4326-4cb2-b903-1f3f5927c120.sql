-- Add new fields to voucher_types table for professional assignment and enhanced functionality
ALTER TABLE public.voucher_types 
ADD COLUMN professional_id UUID REFERENCES public.professionals(id),
ADD COLUMN photo_url TEXT,
ADD COLUMN session_duration_min INTEGER;

-- Create storage policies for voucher_types photos in public-media bucket
CREATE POLICY "Authenticated users can upload voucher type photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'public-media' AND 
  (storage.foldername(name))[1] = 'voucher_types'
);

CREATE POLICY "Authenticated users can update voucher type photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'public-media' AND 
  (storage.foldername(name))[1] = 'voucher_types'
);

CREATE POLICY "Authenticated users can delete voucher type photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'public-media' AND 
  (storage.foldername(name))[1] = 'voucher_types'
);

-- Add validation check for session_duration_min
ALTER TABLE public.voucher_types 
ADD CONSTRAINT check_session_duration_positive 
CHECK (session_duration_min IS NULL OR session_duration_min > 0);