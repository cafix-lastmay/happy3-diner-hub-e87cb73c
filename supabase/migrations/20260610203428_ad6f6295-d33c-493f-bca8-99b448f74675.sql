
CREATE OR REPLACE FUNCTION public.get_menu_for_delivery(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cafe RECORD;
  cats jsonb; items jsonb; popular jsonb; footer jsonb;
BEGIN
  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url,
         mode_delivery, service_percent, tax_percent, tax_apply_delivery, estimated_delivery_minutes,
         whatsapp
    INTO cafe FROM public.cafeterias
   WHERE delivery_qr_token = _token AND is_active = true AND mode_delivery = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) ORDER BY c.sort_order, c.name), '[]'::jsonb)
    INTO cats
    FROM public.menu_categories c
    LEFT JOIN public.category_mode_visibility cmv ON cmv.category_id = c.id AND cmv.mode = 'delivery'::order_mode
   WHERE c.cafeteria_ref_code = cafe.ref_code AND c.is_active = true AND COALESCE(cmv.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(NULLIF(mo.name,''), i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, i.price),
           'image_url', COALESCE(NULLIF(mo.image_url,''), i.image_url),
           'is_most_popular', i.is_most_popular,
           'sort_order', i.sort_order
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items
    FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'delivery'::order_mode
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true
     AND COALESCE(mo.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(NULLIF(mo.name,''), i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, i.price),
           'image_url', COALESCE(NULLIF(mo.image_url,''), i.image_url),
           'is_most_popular', true,
           'sort_order', i.sort_order
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO popular
    FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'delivery'::order_mode
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true AND i.is_most_popular = true
     AND COALESCE(mo.is_visible, true) = true;

  SELECT jsonb_build_object('enabled', footer_banner_enabled, 'text', footer_banner_text, 'cta_text', footer_banner_cta_text, 'url', footer_banner_url)
    INTO footer FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object(
    'cafeteria', to_jsonb(cafe),
    'categories', cats,
    'items', items,
    'popular', popular,
    'footer_banner', footer
  );
END;
$function$;
