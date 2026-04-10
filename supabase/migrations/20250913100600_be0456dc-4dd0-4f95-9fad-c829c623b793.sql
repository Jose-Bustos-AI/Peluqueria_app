-- Create storage bucket for public media (professionals photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-media', 
  'public-media', 
  true, 
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
);

-- Create RLS policies for the public-media bucket
-- Allow public access to view files
CREATE POLICY "Public access for public-media" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'public-media');

-- Allow authenticated users to upload files to their professional folders
CREATE POLICY "Allow authenticated uploads to public-media" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'public-media' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update files in public-media
CREATE POLICY "Allow authenticated updates to public-media" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'public-media' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete files in public-media
CREATE POLICY "Allow authenticated deletes from public-media" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'public-media' 
  AND auth.role() = 'authenticated'
);