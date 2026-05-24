-- Allow cafeteria admins to update/delete their own recharge receipts in storage
DROP POLICY IF EXISTS "recharge-receipts cafe delete own" ON storage.objects;
DROP POLICY IF EXISTS "recharge-receipts cafe update own" ON storage.objects;

CREATE POLICY "recharge-receipts cafe delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'recharge-receipts'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);

CREATE POLICY "recharge-receipts cafe update own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'recharge-receipts'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
)
WITH CHECK (
  bucket_id = 'recharge-receipts'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);