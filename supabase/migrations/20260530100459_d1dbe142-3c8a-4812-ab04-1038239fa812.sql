-- Fix place_order_takeaway: remove phone requirement, keep signature unchanged
DROP FUNCTION IF EXISTS public.place_order_takeaway(text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.place_order_takeaway(
  _token text,
  _customer_name text,
  _customer_phone text,
  _notes text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cafe RECORD; it jsonb; mi RECORD; qty int;
  grand numeric(12,2) := 0; new_order_id uuid;
  ovr RECORD; ovr_found boolean;
  effective_price numeric(12,2); effective_name text;
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
            trim(_customer_name), NULLIF(trim(_customer_phone), ''), _notes, 0)
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

  IF cafe.tax_apply_takeaway = true AND cafe.tax_percent > 0 THEN
    grand := grand + (grand * cafe.tax_percent / 100);
  END IF;
  IF cafe.service_percent > 0 THEN
    grand := grand + (grand * cafe.service_percent / 100);
  END IF;

  UPDATE public.orders SET total = grand WHERE id = new_order_id;
  RETURN new_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order_takeaway(text, text, text, text, jsonb) TO PUBLIC;


-- Fix place_order_delivery: remove phone requirement, keep signature unchanged
DROP FUNCTION IF EXISTS public.place_order_delivery(text, text, text, text, numeric, numeric, text, jsonb);

CREATE OR REPLACE FUNCTION public.place_order_delivery(
  _token text,
  _customer_name text,
  _customer_phone text,
  _customer_address text,
  _customer_lat numeric,
  _customer_lng numeric,
  _notes text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cafe RECORD; it jsonb; mi RECORD; qty int;
  grand numeric(12,2) := 0; new_order_id uuid;
  ovr RECORD; ovr_found boolean;
  effective_price numeric(12,2); effective_name text;
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

  INSERT INTO public.orders (cafeteria_ref_code, table_label, mode, status, customer_name, customer_phone, notes, total)
    VALUES (cafe.ref_code, 'Delivery', 'delivery'::order_mode, 'new'::order_status,
            trim(_customer_name), NULLIF(trim(_customer_phone), ''), _notes, 0)
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

  INSERT INTO public.delivery_details (
    order_id, cafeteria_ref_code, customer_name, customer_phone,
    customer_address, customer_lat, customer_lng, status
  ) VALUES (
    new_order_id, cafe.ref_code, trim(_customer_name), NULLIF(trim(_customer_phone), ''),
    trim(_customer_address), _customer_lat, _customer_lng, 'pending_assignment'::delivery_status
  );

  RETURN new_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order_delivery(text, text, text, text, numeric, numeric, text, jsonb) TO PUBLIC;


-- Fix place_delivery_order: remove phone requirement, keep signature unchanged
DROP FUNCTION IF EXISTS public.place_delivery_order(text, text, text, text, numeric, numeric, text, jsonb);

CREATE OR REPLACE FUNCTION public.place_delivery_order(
  _takeaway_token text,
  _customer_name text,
  _customer_phone text,
  _customer_address text,
  _customer_lat numeric,
  _customer_lng numeric,
  _notes text,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cafe RECORD; it JSONB; mi RECORD; qty INT;
  grand NUMERIC(12,2) := 0; new_order_id UUID;
  cafe_balance NUMERIC(14,2); trial_ok boolean;
  effective_price NUMERIC(12,2);
  ovr RECORD; ovr_found boolean;
  short_code text;
BEGIN
  IF _customer_address IS NULL OR length(trim(_customer_address)) = 0 THEN RAISE EXCEPTION 'ADDRESS_REQUIRED'; END IF;

  SELECT * INTO cafe FROM public.cafeterias
   WHERE takeaway_qr_token = _takeaway_token AND is_active = true AND mode_delivery = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid delivery token'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  trial_ok := public.cafeteria_trial_active(cafe.ref_code);
  SELECT points_balance INTO cafe_balance FROM public.cafeterias WHERE ref_code = cafe.ref_code;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID AND cafeteria_ref_code = cafe.ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;
    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = 'delivery';
    ovr_found := FOUND;
    IF ovr_found AND ovr.is_visible = false THEN RAISE EXCEPTION 'Item not available'; END IF;
    effective_price := NULL;
    IF ovr_found AND ovr.price IS NOT NULL THEN effective_price := ovr.price; END IF;
    IF effective_price IS NULL THEN effective_price := mi.price; END IF;
    grand := grand + (effective_price * qty);
  END LOOP;
  IF grand <= 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  IF NOT trial_ok AND (cafe_balance IS NULL OR cafe_balance < grand) THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  FOR i IN 1..8 LOOP
    short_code := upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 4));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.orders
       WHERE cafeteria_ref_code = cafe.ref_code AND table_label = short_code
         AND status NOT IN ('paid','cancelled','served')
    );
  END LOOP;

  INSERT INTO public.orders(cafeteria_ref_code, table_id, table_label, customer_name, customer_phone, notes, total, status, mode)
  VALUES (cafe.ref_code, NULL, short_code, NULLIF(_customer_name,''), NULLIF(_customer_phone,''), NULLIF(_notes,''), grand, 'awaiting_payment', 'delivery')
  RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items WHERE id = (it->>'item_id')::UUID;
    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = 'delivery';
    ovr_found := FOUND;
    effective_price := NULL;
    IF ovr_found AND ovr.price IS NOT NULL THEN effective_price := ovr.price; END IF;
    IF effective_price IS NULL THEN effective_price := mi.price; END IF;
    INSERT INTO public.order_items(order_id, item_id, name_snapshot, price_snapshot, qty, notes)
    VALUES (new_order_id, mi.id, mi.name, effective_price, qty, NULLIF(it->>'notes',''));
  END LOOP;

  INSERT INTO public.delivery_details(order_id, cafeteria_ref_code, customer_name, customer_phone, customer_address, customer_lat, customer_lng, status)
  VALUES (new_order_id, cafe.ref_code, NULLIF(_customer_name,''), NULLIF(_customer_phone,''), _customer_address, _customer_lat, _customer_lng, 'pending_assignment');

  PERFORM public.create_notification(cafe.user_id, 'order.delivery_new',
    'New delivery order', 'A new delivery order needs a driver',
    jsonb_build_object('order_id', new_order_id, 'cafeteria_ref_code', cafe.ref_code));

  RETURN jsonb_build_object('order_id', new_order_id, 'short_code', short_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_delivery_order(text, text, text, text, numeric, numeric, text, jsonb) TO PUBLIC;
