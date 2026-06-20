-- 1) business_type enum + column on cafeterias
DO $$ BEGIN
  CREATE TYPE public.business_type AS ENUM ('full_cafe', 'home_seller');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.cafeterias
  ADD COLUMN IF NOT EXISTS business_type public.business_type NOT NULL DEFAULT 'full_cafe';

-- 2) available_today flag for menu items (daily quick toggle)
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS available_today boolean NOT NULL DEFAULT true;

-- 3) Patch the 3 customer menu RPCs to also filter on available_today
CREATE OR REPLACE FUNCTION public.get_menu_for_qr(_qr_token text, _mode order_mode DEFAULT 'dine_in'::order_mode)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  tbl RECORD; cafe RECORD;
  active_tier_id uuid; active_tier_name text;
  sec_tier_id uuid;
  cats jsonb; items jsonb; popular jsonb; footer jsonb;
BEGIN
  SELECT id, cafeteria_ref_code, label, section_id
    INTO tbl FROM public.restaurant_tables
   WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url,
         mode_dine_in, mode_takeaway, mode_delivery, estimated_delivery_minutes,
         delivery_fee_a_name, delivery_fee_a_amount,
         delivery_fee_b_name, delivery_fee_b_amount,
         delivery_fee_c_name, delivery_fee_c_amount
    INTO cafe FROM public.cafeterias
   WHERE ref_code = tbl.cafeteria_ref_code AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF tbl.section_id IS NOT NULL THEN
    SELECT s.price_tier_id INTO sec_tier_id FROM public.table_sections s WHERE s.id = tbl.section_id;
  END IF;
  IF sec_tier_id IS NOT NULL THEN
    SELECT id, name INTO active_tier_id, active_tier_name FROM public.price_tiers WHERE id = sec_tier_id AND is_active = true;
  END IF;
  IF active_tier_id IS NULL THEN
    SELECT id, name INTO active_tier_id, active_tier_name FROM public.price_tiers
     WHERE cafeteria_ref_code = tbl.cafeteria_ref_code AND is_default = true AND is_active = true LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) ORDER BY c.sort_order, c.name), '[]'::jsonb)
    INTO cats
    FROM public.menu_categories c
    LEFT JOIN public.category_mode_visibility cmv ON cmv.category_id = c.id AND cmv.mode = _mode
   WHERE c.cafeteria_ref_code = tbl.cafeteria_ref_code AND c.is_active = true AND COALESCE(cmv.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(mo.name, i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, CASE WHEN _mode = 'dine_in' THEN mip.price ELSE NULL END, i.price),
           'image_url', COALESCE(mo.image_url, i.image_url),
           'is_most_popular', i.is_most_popular,
           'sort_order', i.sort_order,
           'sizes_enabled', COALESCE(i.sizes_enabled, false),
           'sizes', CASE WHEN COALESCE(i.sizes_enabled,false) THEN COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'id', ms.id, 'name', ms.name, 'description', ms.description,
               'price', COALESCE(ms.price_dine_in, ms.price),
               'is_default', ms.is_default, 'sort_order', ms.sort_order
             ) ORDER BY ms.sort_order, ms.name)
             FROM public.menu_item_sizes ms
             WHERE ms.menu_item_id = i.id AND ms.is_available = true
           ), '[]'::jsonb) ELSE '[]'::jsonb END
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items
    FROM public.menu_items i
    LEFT JOIN public.menu_item_prices mip ON mip.item_id = i.id AND mip.tier_id = active_tier_id
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = _mode
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true
     AND COALESCE(i.available_today, true) = true
     AND COALESCE(mo.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(mo.name, i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, CASE WHEN _mode = 'dine_in' THEN mip.price ELSE NULL END, i.price),
           'image_url', COALESCE(mo.image_url, i.image_url)
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO popular
    FROM public.menu_items i
    LEFT JOIN public.menu_item_prices mip ON mip.item_id = i.id AND mip.tier_id = active_tier_id
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = _mode
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true
     AND COALESCE(i.available_today, true) = true
     AND i.is_most_popular = true AND COALESCE(mo.is_visible, true) = true;

  SELECT jsonb_build_object('enabled', COALESCE(footer_banner_enabled, false), 'text', footer_banner_text, 'cta_text', footer_banner_cta_text, 'url', footer_banner_url)
    INTO footer FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object(
    'table', jsonb_build_object('id', tbl.id, 'label', tbl.label, 'cafeteria_ref_code', tbl.cafeteria_ref_code),
    'cafeteria', jsonb_build_object(
                   'ref_code', cafe.ref_code, 'name', cafe.name, 'currency_code', cafe.currency_code,
                   'menu_header_url', cafe.menu_header_url, 'menu_footer_url', cafe.menu_footer_url, 'banner_url', cafe.banner_url,
                   'mode_dine_in', cafe.mode_dine_in, 'mode_takeaway', cafe.mode_takeaway, 'mode_delivery', cafe.mode_delivery,
                   'estimated_delivery_minutes', cafe.estimated_delivery_minutes
                 ),
    'mode', _mode,
    'active_tier', CASE WHEN active_tier_id IS NULL THEN NULL ELSE jsonb_build_object('id', active_tier_id, 'name', active_tier_name) END,
    'footer_banner', COALESCE(footer, jsonb_build_object('enabled', false)),
    'categories', cats, 'items', items, 'popular', popular
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_menu_for_takeaway(_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cafe RECORD;
  cats jsonb; items jsonb; popular jsonb; footer jsonb;
BEGIN
  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url,
         mode_takeaway, service_percent, tax_percent, tax_apply_takeaway, whatsapp
    INTO cafe FROM public.cafeterias
   WHERE takeaway_qr_token = _token AND is_active = true AND mode_takeaway = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) ORDER BY c.sort_order, c.name), '[]'::jsonb)
    INTO cats FROM public.menu_categories c
    LEFT JOIN public.category_mode_visibility cmv ON cmv.category_id = c.id AND cmv.mode = 'take_away'::order_mode
   WHERE c.cafeteria_ref_code = cafe.ref_code AND c.is_active = true AND COALESCE(cmv.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(NULLIF(mo.name,''), i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, i.price),
           'image_url', COALESCE(NULLIF(mo.image_url,''), i.image_url),
           'is_most_popular', i.is_most_popular,
           'sort_order', i.sort_order,
           'sizes_enabled', COALESCE(i.sizes_enabled, false),
           'sizes', CASE WHEN COALESCE(i.sizes_enabled,false) THEN COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'description', ms.description,
               'price', COALESCE(ms.price_takeaway, ms.price),
               'is_default', ms.is_default, 'sort_order', ms.sort_order) ORDER BY ms.sort_order, ms.name)
             FROM public.menu_item_sizes ms WHERE ms.menu_item_id = i.id AND ms.is_available = true
           ), '[]'::jsonb) ELSE '[]'::jsonb END
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'take_away'::order_mode
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true
     AND COALESCE(i.available_today, true) = true
     AND COALESCE(mo.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(NULLIF(mo.name,''), i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, i.price),
           'image_url', COALESCE(NULLIF(mo.image_url,''), i.image_url),
           'is_most_popular', true, 'sort_order', i.sort_order
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO popular FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'take_away'::order_mode
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true
     AND COALESCE(i.available_today, true) = true
     AND i.is_most_popular = true AND COALESCE(mo.is_visible, true) = true;

  SELECT jsonb_build_object('enabled', footer_banner_enabled, 'text', footer_banner_text, 'cta_text', footer_banner_cta_text, 'url', footer_banner_url)
    INTO footer FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object('cafeteria', to_jsonb(cafe), 'categories', cats, 'items', items, 'popular', popular, 'footer_banner', footer);
END $function$;

CREATE OR REPLACE FUNCTION public.get_menu_for_delivery(_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cafe RECORD;
  cats jsonb; items jsonb; popular jsonb; footer jsonb;
BEGIN
  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url,
         mode_delivery, service_percent, tax_percent, tax_apply_delivery, estimated_delivery_minutes, whatsapp
    INTO cafe FROM public.cafeterias
   WHERE delivery_qr_token = _token AND is_active = true AND mode_delivery = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) ORDER BY c.sort_order, c.name), '[]'::jsonb)
    INTO cats FROM public.menu_categories c
    LEFT JOIN public.category_mode_visibility cmv ON cmv.category_id = c.id AND cmv.mode = 'delivery'::order_mode
   WHERE c.cafeteria_ref_code = cafe.ref_code AND c.is_active = true AND COALESCE(cmv.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(NULLIF(mo.name,''), i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, i.price),
           'image_url', COALESCE(NULLIF(mo.image_url,''), i.image_url),
           'is_most_popular', i.is_most_popular,
           'sort_order', i.sort_order,
           'sizes_enabled', COALESCE(i.sizes_enabled, false),
           'sizes', CASE WHEN COALESCE(i.sizes_enabled,false) THEN COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'description', ms.description,
               'price', COALESCE(ms.price_delivery, ms.price),
               'is_default', ms.is_default, 'sort_order', ms.sort_order) ORDER BY ms.sort_order, ms.name)
             FROM public.menu_item_sizes ms WHERE ms.menu_item_id = i.id AND ms.is_available = true
           ), '[]'::jsonb) ELSE '[]'::jsonb END
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'delivery'::order_mode
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true
     AND COALESCE(i.available_today, true) = true
     AND COALESCE(mo.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(NULLIF(mo.name,''), i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, i.price),
           'image_url', COALESCE(NULLIF(mo.image_url,''), i.image_url),
           'is_most_popular', true, 'sort_order', i.sort_order
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO popular FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'delivery'::order_mode
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true
     AND COALESCE(i.available_today, true) = true
     AND i.is_most_popular = true AND COALESCE(mo.is_visible, true) = true;

  SELECT jsonb_build_object('enabled', footer_banner_enabled, 'text', footer_banner_text, 'cta_text', footer_banner_cta_text, 'url', footer_banner_url)
    INTO footer FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object('cafeteria', to_jsonb(cafe), 'categories', cats, 'items', items, 'popular', popular, 'footer_banner', footer);
END $function$;