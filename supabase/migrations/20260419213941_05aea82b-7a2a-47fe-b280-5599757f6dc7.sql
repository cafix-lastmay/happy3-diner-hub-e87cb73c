-- 1) Cafeteria-specific header banner
ALTER TABLE public.cafeterias
  ADD COLUMN IF NOT EXISTS header_banner_text text,
  ADD COLUMN IF NOT EXISTS header_banner_cta_text text,
  ADD COLUMN IF NOT EXISTS header_banner_url text,
  ADD COLUMN IF NOT EXISTS header_banner_enabled boolean NOT NULL DEFAULT false;

-- 2) Global footer banner (owner-managed) on app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS footer_banner_text text,
  ADD COLUMN IF NOT EXISTS footer_banner_cta_text text,
  ADD COLUMN IF NOT EXISTS footer_banner_url text,
  ADD COLUMN IF NOT EXISTS footer_banner_enabled boolean NOT NULL DEFAULT false;

-- 3) Owner-only RPC to update footer banner (defense-in-depth on top of RLS)
CREATE OR REPLACE FUNCTION public.owner_set_footer_banner(
  _text text,
  _cta_text text,
  _url text,
  _enabled boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only owner can manage the global footer banner';
  END IF;
  IF _url IS NOT NULL AND length(_url) > 0
     AND _url !~* '^https?://' THEN
    RAISE EXCEPTION 'URL must start with http:// or https://';
  END IF;
  UPDATE public.app_settings
    SET footer_banner_text = NULLIF(_text, ''),
        footer_banner_cta_text = NULLIF(_cta_text, ''),
        footer_banner_url = NULLIF(_url, ''),
        footer_banner_enabled = COALESCE(_enabled, false),
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = true;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_set_footer_banner(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_set_footer_banner(text, text, text, boolean) TO authenticated;

-- 4) Update get_menu_for_qr to include both banners
CREATE OR REPLACE FUNCTION public.get_menu_for_qr(_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tbl RECORD;
  cafe RECORD;
  cats jsonb;
  items jsonb;
  footer jsonb;
BEGIN
  SELECT id, cafeteria_ref_code, label, section_id
    INTO tbl
    FROM public.restaurant_tables
   WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url,
         header_banner_text, header_banner_cta_text, header_banner_url, header_banner_enabled
    INTO cafe
    FROM public.cafeterias
   WHERE ref_code = tbl.cafeteria_ref_code AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

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

  SELECT jsonb_build_object(
           'enabled', COALESCE(footer_banner_enabled, false),
           'text', footer_banner_text,
           'cta_text', footer_banner_cta_text,
           'url', footer_banner_url
         )
    INTO footer
    FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object(
    'table',      jsonb_build_object('id', tbl.id, 'label', tbl.label, 'cafeteria_ref_code', tbl.cafeteria_ref_code),
    'cafeteria',  jsonb_build_object(
                    'ref_code', cafe.ref_code,
                    'name', cafe.name,
                    'currency_code', cafe.currency_code,
                    'menu_header_url', cafe.menu_header_url,
                    'menu_footer_url', cafe.menu_footer_url
                  ),
    'header_banner', jsonb_build_object(
                    'enabled', COALESCE(cafe.header_banner_enabled, false),
                    'text', cafe.header_banner_text,
                    'cta_text', cafe.header_banner_cta_text,
                    'url', cafe.header_banner_url
                  ),
    'footer_banner', COALESCE(footer, jsonb_build_object('enabled', false)),
    'categories', cats,
    'items',      items
  );
END;
$function$;