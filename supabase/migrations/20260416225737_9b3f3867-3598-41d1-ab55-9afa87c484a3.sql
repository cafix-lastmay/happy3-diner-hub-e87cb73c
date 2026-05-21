
DROP POLICY IF EXISTS "Public reads menu images" ON storage.objects;
CREATE POLICY "Public reads menu images by path" ON storage.objects
  FOR SELECT USING (bucket_id = 'menu-images' AND name IS NOT NULL AND length(name) > 0 AND position('/' in name) > 0);
