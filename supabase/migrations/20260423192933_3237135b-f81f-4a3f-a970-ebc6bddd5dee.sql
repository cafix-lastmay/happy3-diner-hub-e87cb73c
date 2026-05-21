-- 1) Cafeterias: replace header_banner_* with single banner_url
ALTER TABLE public.cafeterias
  DROP COLUMN IF EXISTS header_banner_text,
  DROP COLUMN IF EXISTS header_banner_cta_text,
  DROP COLUMN IF EXISTS header_banner_url,
  DROP COLUMN IF EXISTS header_banner_enabled,
  DROP COLUMN IF EXISTS header_banner_image_url,
  ADD COLUMN IF NOT EXISTS banner_url text;

-- 2) Menu items: most popular flag
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_most_popular boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_menu_items_popular
  ON public.menu_items(cafeteria_ref_code) WHERE is_most_popular;

-- 3) Update customer menu RPC
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
  popular jsonb;
  footer jsonb;
BEGIN
  SELECT id, cafeteria_ref_code, label, section_id
    INTO tbl
    FROM public.restaurant_tables
   WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url
    INTO cafe
    FROM public.cafeterias
   WHERE ref_code = tbl.cafeteria_ref_code AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'sort_order', c.sort_order
         ) ORDER BY c.sort_order, c.name), '[]'::jsonb)
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
           'is_most_popular', i.is_most_popular,
           'sort_order', i.sort_order
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items
    FROM public.menu_items i
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'category_id', i.category_id,
           'name', i.name,
           'description', i.description,
           'price', i.price,
           'image_url', i.image_url
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO popular
    FROM public.menu_items i
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code
     AND i.is_available = true
     AND i.is_most_popular = true;

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
                    'menu_footer_url', cafe.menu_footer_url,
                    'banner_url', cafe.banner_url
                  ),
    'footer_banner', COALESCE(footer, jsonb_build_object('enabled', false)),
    'categories', cats,
    'items',      items,
    'popular',    popular
  );
END;
$function$;