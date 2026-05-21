ALTER TABLE public.cafeterias ADD COLUMN IF NOT EXISTS logo_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('cafeteria-logos', 'cafeteria-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public reads cafeteria logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'cafeteria-logos');

CREATE POLICY "Cafe admin uploads own logo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'cafeteria-logos'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);

CREATE POLICY "Cafe admin updates own logo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'cafeteria-logos'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);

CREATE POLICY "Cafe admin deletes own logo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'cafeteria-logos'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);