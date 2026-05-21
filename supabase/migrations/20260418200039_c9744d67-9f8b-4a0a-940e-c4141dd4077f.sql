-- =====================================================================
-- 1) Hide restaurant_tables from public listing (keeps qr_token private)
-- =====================================================================
DROP POLICY IF EXISTS "Public reads active tables" ON public.restaurant_tables;

-- =====================================================================
-- 2) Public menu access via secure RPC instead of direct table reads
-- =====================================================================
DROP POLICY IF EXISTS "Public reads active categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Public reads available items" ON public.menu_items;
DROP POLICY IF EXISTS "Public reads active sections" ON public.table_sections;

-- Single security-definer RPC that validates the qr_token then returns
-- everything the customer page needs in one round-trip.
CREATE OR REPLACE FUNCTION public.get_menu_for_qr(_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tbl RECORD;
  cafe RECORD;
  cats jsonb;
  items jsonb;
BEGIN
  SELECT id, cafeteria_ref_code, label, section_id
    INTO tbl
    FROM public.restaurant_tables
   WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT ref_code, name, currency_code
    INTO cafe
    FROM public.cafeterias
   WHERE ref_code = tbl.cafeteria_ref_code AND is_active = true;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'sort_order', c.sort_order
         ) ORDER BY c.sort_order), '[]'::jsonb)
    INTO cats
    FROM public.menu_categories c
   WHERE c.cafeteria_ref_code = tbl.cafeteria_ref_code AND c.is_active = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'category_id', i.category_id,
           'name', i.name,
           'description', i.description,
           'price', i.price,
           'image_url', i.image_url,
           'sort_order', i.sort_order
         ) ORDER BY i.sort_order), '[]'::jsonb)
    INTO items
    FROM public.menu_items i
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true;

  RETURN jsonb_build_object(
    'table',       jsonb_build_object('id', tbl.id, 'label', tbl.label, 'cafeteria_ref_code', tbl.cafeteria_ref_code),
    'cafeteria',   jsonb_build_object('ref_code', cafe.ref_code, 'name', cafe.name, 'currency_code', cafe.currency_code),
    'categories',  cats,
    'items',       items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_menu_for_qr(text) TO anon, authenticated;

-- =====================================================================
-- 3) Storage: tighten writes on public buckets (reads stay public)
-- =====================================================================

-- menu-images: only the owning cafeteria admin/manager may write
DROP POLICY IF EXISTS "menu-images public read" ON storage.objects;
DROP POLICY IF EXISTS "menu-images write own cafe" ON storage.objects;
DROP POLICY IF EXISTS "menu-images update own cafe" ON storage.objects;
DROP POLICY IF EXISTS "menu-images delete own cafe" ON storage.objects;

CREATE POLICY "menu-images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'menu-images');

CREATE POLICY "menu-images write own cafe"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'menu-images'
  AND (
    (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
    OR (storage.foldername(name))[1] = public.get_my_manager_cafeteria_ref()
  )
);

CREATE POLICY "menu-images update own cafe"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'menu-images'
  AND (
    (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
    OR (storage.foldername(name))[1] = public.get_my_manager_cafeteria_ref()
  )
);

CREATE POLICY "menu-images delete own cafe"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'menu-images'
  AND (
    (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
    OR (storage.foldername(name))[1] = public.get_my_manager_cafeteria_ref()
  )
);

-- cafeteria-logos: same pattern
DROP POLICY IF EXISTS "cafeteria-logos public read" ON storage.objects;
DROP POLICY IF EXISTS "cafeteria-logos write own cafe" ON storage.objects;
DROP POLICY IF EXISTS "cafeteria-logos update own cafe" ON storage.objects;
DROP POLICY IF EXISTS "cafeteria-logos delete own cafe" ON storage.objects;

CREATE POLICY "cafeteria-logos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'cafeteria-logos');

CREATE POLICY "cafeteria-logos write own cafe"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cafeteria-logos'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);

CREATE POLICY "cafeteria-logos update own cafe"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'cafeteria-logos'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);

CREATE POLICY "cafeteria-logos delete own cafe"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'cafeteria-logos'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);

-- recharge-receipts (private bucket): only owner + uploader cafeteria
DROP POLICY IF EXISTS "recharge-receipts cafe read own" ON storage.objects;
DROP POLICY IF EXISTS "recharge-receipts owner read" ON storage.objects;
DROP POLICY IF EXISTS "recharge-receipts cafe upload" ON storage.objects;

CREATE POLICY "recharge-receipts cafe upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'recharge-receipts'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);

CREATE POLICY "recharge-receipts cafe read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'recharge-receipts'
  AND (storage.foldername(name))[1] = public.get_my_cafeteria_ref_code()
);

CREATE POLICY "recharge-receipts owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'recharge-receipts'
  AND public.has_role(auth.uid(), 'owner')
);