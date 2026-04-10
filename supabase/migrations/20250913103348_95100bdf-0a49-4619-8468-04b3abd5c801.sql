-- Storage RLS policies for bucket "public-media" restricted to professionals/* paths
-- Safe drops to avoid duplicates, then recreate with exact conditions requested

-- Ensure RLS is enabled (it is by default, but this is idempotent)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Public read access for public-media
DROP POLICY IF EXISTS "public read for public-media" ON storage.objects;
CREATE POLICY "public read for public-media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'public-media');

-- Insert: authenticated only, path under professionals/
DROP POLICY IF EXISTS "admins can insert professionals photos" ON storage.objects;
CREATE POLICY "admins can insert professionals photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'public-media'
  AND name LIKE 'professionals/%'
);

-- Update: authenticated only, path under professionals/
DROP POLICY IF EXISTS "admins can update professionals photos" ON storage.objects;
CREATE POLICY "admins can update professionals photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'public-media'
  AND name LIKE 'professionals/%'
)
WITH CHECK (
  bucket_id = 'public-media'
  AND name LIKE 'professionals/%'
);

-- Delete: authenticated only, path under professionals/
DROP POLICY IF EXISTS "admins can delete professionals photos" ON storage.objects;
CREATE POLICY "admins can delete professionals photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'public-media'
  AND name LIKE 'professionals/%'
);
