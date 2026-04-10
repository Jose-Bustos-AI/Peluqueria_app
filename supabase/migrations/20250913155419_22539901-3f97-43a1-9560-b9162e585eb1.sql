-- Add storage policies for category icons
CREATE POLICY "Authenticated users can manage category icons"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'public-media' AND name LIKE 'categories/%')
WITH CHECK (bucket_id = 'public-media' AND name LIKE 'categories/%');