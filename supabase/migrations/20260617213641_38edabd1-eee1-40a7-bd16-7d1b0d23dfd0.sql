
-- get_menu_for_qr: include sizes per item
CREATE OR REPLACE FUNCTION public.get_menu_for_qr(_qr_token text, _mode order_mode DEFAULT 'dine_in'::order_mode)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
           'sizes', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'id', ms.id, 'name', ms.name, 'description', ms.description,
               'price', ms.price, 'is_default', ms.is_default, 'sort_order', ms.sort_order
             ) ORDER BY ms.sort_order, ms.name)
             FROM public.menu_item_sizes ms
             WHERE ms.menu_item_id = i.id AND ms.is_available = true
           ), '[]'::jsonb)
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items
    FROM public.menu_items i
    LEFT JOIN public.menu_item_prices mip ON mip.item_id = i.id AND mip.tier_id = active_tier_id
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = _mode
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true AND COALESCE(mo.is_visible, true) = true;

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
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true AND i.is_most_popular = true AND COALESCE(mo.is_visible, true) = true;

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

-- get_menu_for_takeaway: include sizes
CREATE OR REPLACE FUNCTION public.get_menu_for_takeaway(_token text)
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
           'sizes', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'description', ms.description, 'price', ms.price, 'is_default', ms.is_default, 'sort_order', ms.sort_order) ORDER BY ms.sort_order, ms.name)
             FROM public.menu_item_sizes ms WHERE ms.menu_item_id = i.id AND ms.is_available = true
           ), '[]'::jsonb)
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'take_away'::order_mode
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true AND COALESCE(mo.is_visible, true) = true;

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
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true AND i.is_most_popular = true AND COALESCE(mo.is_visible, true) = true;

  SELECT jsonb_build_object('enabled', footer_banner_enabled, 'text', footer_banner_text, 'cta_text', footer_banner_cta_text, 'url', footer_banner_url)
    INTO footer FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object('cafeteria', to_jsonb(cafe), 'categories', cats, 'items', items, 'popular', popular, 'footer_banner', footer);
END $function$;

-- get_menu_for_delivery: include sizes
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
           'sizes', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'description', ms.description, 'price', ms.price, 'is_default', ms.is_default, 'sort_order', ms.sort_order) ORDER BY ms.sort_order, ms.name)
             FROM public.menu_item_sizes ms WHERE ms.menu_item_id = i.id AND ms.is_available = true
           ), '[]'::jsonb)
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'delivery'::order_mode
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true AND COALESCE(mo.is_visible, true) = true;

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
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true AND i.is_most_popular = true AND COALESCE(mo.is_visible, true) = true;

  SELECT jsonb_build_object('enabled', footer_banner_enabled, 'text', footer_banner_text, 'cta_text', footer_banner_cta_text, 'url', footer_banner_url)
    INTO footer FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object('cafeteria', to_jsonb(cafe), 'categories', cats, 'items', items, 'popular', popular, 'footer_banner', footer);
END $function$;

-- place_order: accept _size_id per line; snapshot size info
CREATE OR REPLACE FUNCTION public.place_order(_qr_token text, _customer_name text, _notes text, _items jsonb, _mode order_mode DEFAULT 'dine_in'::order_mode)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tbl RECORD; it JSONB; mi RECORD; qty INT;
  grand NUMERIC(12,2) := 0; new_order_id UUID;
  matched_shift_id UUID; matched_user UUID;
  total_qty INT := 0;
  active_tier_id uuid; active_tier_name text;
  effective_price numeric(12,2); effective_name text;
  ovr RECORD; ovr_found boolean; sec RECORD;
  sz RECORD; sid uuid; line_size_name text;
BEGIN
  SELECT * INTO tbl FROM public.restaurant_tables WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive table'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;
  IF public.cafeteria_is_blocked(tbl.cafeteria_ref_code) THEN
    RAISE EXCEPTION 'CAFETERIA_BLOCKED: cafeteria is suspended — recharge required';
  END IF;

  IF tbl.section_id IS NOT NULL THEN
    SELECT s.price_tier_id INTO sec FROM public.table_sections s WHERE s.id = tbl.section_id;
    active_tier_id := sec.price_tier_id;
  END IF;
  IF active_tier_id IS NULL THEN
    SELECT id INTO active_tier_id FROM public.price_tiers
     WHERE cafeteria_ref_code = tbl.cafeteria_ref_code AND is_default = true AND is_active = true LIMIT 1;
  END IF;
  IF active_tier_id IS NOT NULL THEN
    SELECT name INTO active_tier_name FROM public.price_tiers WHERE id = active_tier_id;
  END IF;

  SELECT s.id, s.staff_user_id INTO matched_shift_id, matched_user
    FROM public.shifts s
   WHERE s.cafeteria_ref_code = tbl.cafeteria_ref_code AND s.status = 'active' AND s.staff_role = 'waiter'
   ORDER BY s.approved_at DESC LIMIT 1;

  INSERT INTO public.orders
    (cafeteria_ref_code, table_id, table_label, customer_name, notes, total, status, mode,
     shift_id, served_by, price_tier_id, price_tier_name)
  VALUES
    (tbl.cafeteria_ref_code, tbl.id, tbl.label, NULLIF(_customer_name,''), NULLIF(_notes,''),
     0, 'new', _mode, matched_shift_id, matched_user, active_tier_id, active_tier_name)
  RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID AND cafeteria_ref_code = tbl.cafeteria_ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;

    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = _mode;
    ovr_found := FOUND;
    IF ovr_found AND ovr.is_visible = false THEN RAISE EXCEPTION 'Item not available'; END IF;

    sid := NULLIF(it->>'size_id','')::uuid;
    line_size_name := NULL;
    IF sid IS NOT NULL THEN
      SELECT * INTO sz FROM public.menu_item_sizes WHERE id = sid AND menu_item_id = mi.id AND is_available = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Size not available'; END IF;
      effective_price := sz.price;
      line_size_name := sz.name;
    ELSE
      effective_price := NULL;
      IF ovr_found AND ovr.price IS NOT NULL THEN
        effective_price := ovr.price;
      ELSIF _mode = 'dine_in' AND active_tier_id IS NOT NULL THEN
        SELECT price INTO effective_price FROM public.menu_item_prices WHERE item_id = mi.id AND tier_id = active_tier_id;
      END IF;
      IF effective_price IS NULL THEN effective_price := mi.price; END IF;
    END IF;

    effective_name := COALESCE(NULLIF(ovr.name,''), mi.name);
    IF line_size_name IS NOT NULL THEN
      effective_name := effective_name || ' — ' || line_size_name;
    END IF;

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes, size_id, size_name, unit_price)
    VALUES (new_order_id, mi.id, effective_name, effective_price, qty, NULLIF(it->>'notes',''), sid, line_size_name, effective_price);

    grand := grand + (effective_price * qty);
    total_qty := total_qty + qty;
  END LOOP;
  IF total_qty = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  UPDATE public.orders SET total = grand WHERE id = new_order_id;
  RETURN new_order_id;
END $function$;

-- place_order_takeaway: accept _size_id
CREATE OR REPLACE FUNCTION public.place_order_takeaway(_token text, _customer_name text, _notes text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cafe RECORD; it jsonb; mi RECORD; qty int;
  grand numeric(12,2) := 0; new_order_id uuid;
  ovr RECORD; ovr_found boolean;
  effective_price numeric(12,2); effective_name text;
  sz RECORD; sid uuid; line_size_name text;
BEGIN
  IF _customer_name IS NULL OR length(trim(_customer_name)) = 0 THEN RAISE EXCEPTION 'CUSTOMER_NAME_REQUIRED'; END IF;
  SELECT * INTO cafe FROM public.cafeterias
    WHERE takeaway_qr_token = _token AND is_active = true AND mode_takeaway = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid takeaway token'; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN
    RAISE EXCEPTION 'CAFETERIA_BLOCKED: cafeteria is suspended — recharge required';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_label, mode, status, customer_name, customer_phone, notes, total)
    VALUES (cafe.ref_code, 'Takeaway', 'take_away'::order_mode, 'awaiting_payment'::order_status,
            trim(_customer_name), NULL, _notes, 0)
    RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::int, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
     WHERE id = (it->>'item_id')::uuid AND cafeteria_ref_code = cafe.ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;
    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = 'take_away'::order_mode;
    ovr_found := FOUND;
    IF ovr_found AND ovr.is_visible = false THEN RAISE EXCEPTION 'Item not available'; END IF;

    sid := NULLIF(it->>'size_id','')::uuid;
    line_size_name := NULL;
    IF sid IS NOT NULL THEN
      SELECT * INTO sz FROM public.menu_item_sizes WHERE id = sid AND menu_item_id = mi.id AND is_available = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Size not available'; END IF;
      effective_price := sz.price;
      line_size_name := sz.name;
    ELSE
      effective_price := COALESCE(CASE WHEN ovr_found THEN ovr.price END, mi.price);
    END IF;
    effective_name := COALESCE(NULLIF(ovr.name,''), mi.name);
    IF line_size_name IS NOT NULL THEN effective_name := effective_name || ' — ' || line_size_name; END IF;

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes, size_id, size_name, unit_price)
      VALUES (new_order_id, mi.id, effective_name, effective_price, qty, NULLIF(it->>'notes',''), sid, line_size_name, effective_price);
    grand := grand + effective_price * qty;
  END LOOP;

  IF cafe.tax_apply_takeaway = true AND cafe.tax_percent > 0 THEN
    grand := grand + (grand * cafe.tax_percent / 100);
  END IF;
  IF cafe.service_percent > 0 THEN
    grand := grand + (grand * cafe.service_percent / 100);
  END IF;
  UPDATE public.orders SET total = grand WHERE id = new_order_id;
  RETURN new_order_id;
END $function$;

-- place_order_delivery: accept _size_id
CREATE OR REPLACE FUNCTION public.place_order_delivery(_token text, _customer_name text, _customer_address text, _customer_lat numeric, _customer_lng numeric, _notes text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cafe RECORD; it jsonb; mi RECORD; qty int;
  grand numeric(12,2) := 0; new_order_id uuid;
  ovr RECORD; ovr_found boolean;
  effective_price numeric(12,2); effective_name text;
  tax_val numeric(12,2) := 0; svc_val numeric(12,2) := 0;
  sz RECORD; sid uuid; line_size_name text;
BEGIN
  IF _customer_name IS NULL OR length(trim(_customer_name)) = 0 THEN RAISE EXCEPTION 'CUSTOMER_NAME_REQUIRED'; END IF;
  IF _customer_address IS NULL OR length(trim(_customer_address)) = 0 THEN RAISE EXCEPTION 'CUSTOMER_ADDRESS_REQUIRED'; END IF;

  SELECT * INTO cafe FROM public.cafeterias
    WHERE delivery_qr_token = _token AND is_active = true AND mode_delivery = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid delivery token'; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN
    RAISE EXCEPTION 'CAFETERIA_BLOCKED: cafeteria is suspended — recharge required';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_label, mode, status, customer_name, notes, total)
    VALUES (cafe.ref_code, 'Delivery', 'delivery'::order_mode, 'new'::order_status,
            trim(_customer_name), _notes, 0)
    RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::int, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
     WHERE id = (it->>'item_id')::uuid AND cafeteria_ref_code = cafe.ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;
    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = 'delivery'::order_mode;
    ovr_found := FOUND;
    IF ovr_found AND ovr.is_visible = false THEN RAISE EXCEPTION 'Item not available'; END IF;

    sid := NULLIF(it->>'size_id','')::uuid;
    line_size_name := NULL;
    IF sid IS NOT NULL THEN
      SELECT * INTO sz FROM public.menu_item_sizes WHERE id = sid AND menu_item_id = mi.id AND is_available = true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Size not available'; END IF;
      effective_price := sz.price;
      line_size_name := sz.name;
    ELSE
      effective_price := COALESCE(CASE WHEN ovr_found THEN ovr.price END, mi.price);
    END IF;
    effective_name := COALESCE(NULLIF(ovr.name,''), mi.name);
    IF line_size_name IS NOT NULL THEN effective_name := effective_name || ' — ' || line_size_name; END IF;

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes, size_id, size_name, unit_price)
      VALUES (new_order_id, mi.id, effective_name, effective_price, qty, NULLIF(it->>'notes',''), sid, line_size_name, effective_price);
    grand := grand + effective_price * qty;
  END LOOP;

  IF cafe.tax_apply_delivery = true AND COALESCE(cafe.tax_percent,0) > 0 THEN
    tax_val := round(grand * cafe.tax_percent / 100.0, 2);
  END IF;
  IF COALESCE(cafe.service_percent,0) > 0 THEN
    svc_val := round(grand * cafe.service_percent / 100.0, 2);
  END IF;

  INSERT INTO public.delivery_details (order_id, cafeteria_ref_code, customer_name, customer_address, customer_lat, customer_lng)
    VALUES (new_order_id, cafe.ref_code, trim(_customer_name), trim(_customer_address), _customer_lat, _customer_lng)
    ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.orders SET total = grand + tax_val + svc_val WHERE id = new_order_id;
  RETURN new_order_id;
END;
$function$;
