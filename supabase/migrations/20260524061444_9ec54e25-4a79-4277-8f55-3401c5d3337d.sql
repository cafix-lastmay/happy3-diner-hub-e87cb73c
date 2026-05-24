
-- 1) delivery_qr_token column on cafeterias
ALTER TABLE public.cafeterias
  ADD COLUMN IF NOT EXISTS delivery_qr_token text;

UPDATE public.cafeterias
  SET delivery_qr_token = replace(gen_random_uuid()::text, '-', '')
  WHERE delivery_qr_token IS NULL;

ALTER TABLE public.cafeterias
  ALTER COLUMN delivery_qr_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS cafeterias_delivery_qr_token_uidx
  ON public.cafeterias(delivery_qr_token);

CREATE UNIQUE INDEX IF NOT EXISTS cafeterias_takeaway_qr_token_uidx
  ON public.cafeterias(takeaway_qr_token);

-- 2) get_menu_for_takeaway
CREATE OR REPLACE FUNCTION public.get_menu_for_takeaway(_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  cafe RECORD;
  cats jsonb; items jsonb; popular jsonb; footer jsonb;
BEGIN
  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url,
         mode_takeaway, service_percent, tax_percent, tax_apply_takeaway
    INTO cafe FROM public.cafeterias
   WHERE takeaway_qr_token = _token AND is_active = true AND mode_takeaway = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) ORDER BY c.sort_order, c.name), '[]'::jsonb)
    INTO cats
    FROM public.menu_categories c
    LEFT JOIN public.category_mode_visibility cmv ON cmv.category_id = c.id AND cmv.mode = 'take_away'::order_mode
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
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'take_away'::order_mode
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
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = 'take_away'::order_mode
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
END $fn$;

-- 3) get_menu_for_delivery (same shape, different mode + token)
CREATE OR REPLACE FUNCTION public.get_menu_for_delivery(_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  cafe RECORD;
  cats jsonb; items jsonb; popular jsonb; footer jsonb;
BEGIN
  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url,
         mode_delivery, service_percent, tax_percent, tax_apply_delivery, estimated_delivery_minutes
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
END $fn$;

-- 4) place_order_takeaway
CREATE OR REPLACE FUNCTION public.place_order_takeaway(
  _token text, _customer_name text, _customer_phone text, _notes text, _items jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  cafe RECORD; it jsonb; mi RECORD; qty int;
  grand numeric(12,2) := 0; new_order_id uuid;
  ovr RECORD; ovr_found boolean;
  effective_price numeric(12,2); effective_name text;
BEGIN
  IF _customer_name IS NULL OR length(trim(_customer_name)) = 0 THEN RAISE EXCEPTION 'CUSTOMER_NAME_REQUIRED'; END IF;
  IF _customer_phone IS NULL OR length(trim(_customer_phone)) = 0 THEN RAISE EXCEPTION 'CUSTOMER_PHONE_REQUIRED'; END IF;

  SELECT * INTO cafe FROM public.cafeterias
    WHERE takeaway_qr_token = _token AND is_active = true AND mode_takeaway = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid takeaway token'; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN
    RAISE EXCEPTION 'CAFETERIA_BLOCKED: cafeteria is suspended — recharge required';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_label, mode, status, customer_name, customer_phone, notes, total)
    VALUES (cafe.ref_code, 'Takeaway', 'take_away'::order_mode, 'awaiting_payment'::order_status,
            trim(_customer_name), trim(_customer_phone), _notes, 0)
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

    effective_price := COALESCE(CASE WHEN ovr_found THEN ovr.price END, mi.price);
    effective_name := COALESCE(NULLIF(ovr.name,''), mi.name);

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
      VALUES (new_order_id, mi.id, effective_name, effective_price, qty, NULLIF(it->>'notes',''));
    grand := grand + effective_price * qty;
  END LOOP;

  -- Apply service percent if mode is configured
  IF cafe.tax_apply_takeaway = true AND cafe.tax_percent > 0 THEN
    grand := grand + (grand * cafe.tax_percent / 100);
  END IF;
  IF cafe.service_percent > 0 THEN
    grand := grand + (grand * cafe.service_percent / 100);
  END IF;

  UPDATE public.orders SET total = grand WHERE id = new_order_id;
  RETURN new_order_id;
END $fn$;

-- 5) place_order_delivery
CREATE OR REPLACE FUNCTION public.place_order_delivery(
  _token text, _customer_name text, _customer_phone text, _customer_address text,
  _customer_lat numeric, _customer_lng numeric, _notes text, _items jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  cafe RECORD; it jsonb; mi RECORD; qty int;
  grand numeric(12,2) := 0; new_order_id uuid;
  ovr RECORD; ovr_found boolean;
  effective_price numeric(12,2); effective_name text;
BEGIN
  IF _customer_name IS NULL OR length(trim(_customer_name)) = 0 THEN RAISE EXCEPTION 'CUSTOMER_NAME_REQUIRED'; END IF;
  IF _customer_phone IS NULL OR length(trim(_customer_phone)) = 0 THEN RAISE EXCEPTION 'CUSTOMER_PHONE_REQUIRED'; END IF;
  IF _customer_address IS NULL OR length(trim(_customer_address)) = 0 THEN RAISE EXCEPTION 'CUSTOMER_ADDRESS_REQUIRED'; END IF;

  SELECT * INTO cafe FROM public.cafeterias
    WHERE delivery_qr_token = _token AND is_active = true AND mode_delivery = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid delivery token'; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN
    RAISE EXCEPTION 'CAFETERIA_BLOCKED: cafeteria is suspended — recharge required';
  END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_label, mode, status, customer_name, customer_phone, notes, total)
    VALUES (cafe.ref_code, 'Delivery', 'delivery'::order_mode, 'new'::order_status,
            trim(_customer_name), trim(_customer_phone), _notes, 0)
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

    effective_price := COALESCE(CASE WHEN ovr_found THEN ovr.price END, mi.price);
    effective_name := COALESCE(NULLIF(ovr.name,''), mi.name);

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
      VALUES (new_order_id, mi.id, effective_name, effective_price, qty, NULLIF(it->>'notes',''));
    grand := grand + effective_price * qty;
  END LOOP;

  IF cafe.tax_apply_delivery = true AND cafe.tax_percent > 0 THEN
    grand := grand + (grand * cafe.tax_percent / 100);
  END IF;
  IF cafe.service_percent > 0 THEN
    grand := grand + (grand * cafe.service_percent / 100);
  END IF;

  UPDATE public.orders SET total = grand WHERE id = new_order_id;

  -- Create delivery_details row for waiter to assign driver
  INSERT INTO public.delivery_details (
    order_id, cafeteria_ref_code, customer_name, customer_phone,
    customer_address, customer_lat, customer_lng, status
  ) VALUES (
    new_order_id, cafe.ref_code, trim(_customer_name), trim(_customer_phone),
    trim(_customer_address), _customer_lat, _customer_lng, 'pending_assignment'::delivery_status
  );

  RETURN new_order_id;
END $fn$;

-- Grant execute to anon + authenticated (customer pages call these without login)
GRANT EXECUTE ON FUNCTION public.get_menu_for_takeaway(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_for_delivery(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order_takeaway(text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order_delivery(text, text, text, text, numeric, numeric, text, jsonb) TO anon, authenticated;
