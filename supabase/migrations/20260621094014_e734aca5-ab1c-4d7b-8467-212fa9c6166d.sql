
DROP POLICY IF EXISTS "Anyone uploads payment proofs" ON storage.objects;

CREATE POLICY "Anyone uploads payment proofs"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.cafeterias c
    WHERE c.ref_code = (storage.foldername(name))[1]
  )
  AND COALESCE(lower(metadata->>'mimetype'), '') IN ('image/jpeg','image/png','image/webp')
  AND COALESCE((metadata->>'size')::bigint, 0) <= 5242880
);
