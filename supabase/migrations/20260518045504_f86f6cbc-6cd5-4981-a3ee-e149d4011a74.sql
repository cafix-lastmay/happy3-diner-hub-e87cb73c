
-- get_takeaway_menu
CREATE OR REPLACE FUNCTION public.get_takeaway_menu(_takeaway_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cafe RECORD;
  cats jsonb; items jsonb; popular jsonb; footer jsonb;
  m order_mode := 'take_away';
BEGIN
  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url,
         mode_dine_in, mode_takeaway, mode_delivery, estimated_delivery_minutes
    INTO cafe FROM public.cafeterias
   WHERE takeaway_qr_token = _takeaway_token AND is_active = true AND mode_takeaway = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) ORDER BY c.sort_order, c.name), '[]'::jsonb)
    INTO cats
    FROM public.menu_categories c
    LEFT JOIN public.category_mode_visibility cmv ON cmv.category_id = c.id AND cmv.mode = m
   WHERE c.cafeteria_ref_code = cafe.ref_code AND c.is_active = true AND COALESCE(cmv.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(mo.name, i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, i.price),
           'image_url', COALESCE(mo.image_url, i.image_url),
           'is_most_popular', i.is_most_popular,
           'sort_order', i.sort_order
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items
    FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = m
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true AND COALESCE(mo.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(mo.name, i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, i.price),
           'image_url', COALESCE(mo.image_url, i.image_url)
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO popular
    FROM public.menu_items i
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = m
   WHERE i.cafeteria_ref_code = cafe.ref_code AND i.is_available = true AND i.is_most_popular = true AND COALESCE(mo.is_visible, true) = true;

  SELECT jsonb_build_object('enabled', COALESCE(footer_banner_enabled, false), 'text', footer_banner_text, 'cta_text', footer_banner_cta_text, 'url', footer_banner_url)
    INTO footer FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object(
    'cafeteria', jsonb_build_object(
                   'ref_code', cafe.ref_code, 'name', cafe.name, 'currency_code', cafe.currency_code,
                   'menu_header_url', cafe.menu_header_url, 'menu_footer_url', cafe.menu_footer_url, 'banner_url', cafe.banner_url,
                   'mode_dine_in', cafe.mode_dine_in, 'mode_takeaway', cafe.mode_takeaway, 'mode_delivery', cafe.mode_delivery
                 ),
    'mode', m,
    'footer_banner', COALESCE(footer, jsonb_build_object('enabled', false)),
    'categories', cats, 'items', items, 'popular', popular
  );
END;
$function$;

-- place_takeaway_order
CREATE OR REPLACE FUNCTION public.place_takeaway_order(
  _takeaway_token text,
  _customer_name text,
  _customer_phone text,
  _notes text,
  _items jsonb
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cafe RECORD; it JSONB; mi RECORD; qty INT;
  grand NUMERIC(12,2) := 0; new_order_id UUID;
  cafe_balance NUMERIC(14,2); trial_ok boolean;
  effective_price NUMERIC(12,2); effective_name text;
  ovr RECORD; ovr_found boolean;
  short_code text;
BEGIN
  SELECT * INTO cafe FROM public.cafeterias
   WHERE takeaway_qr_token = _takeaway_token AND is_active = true AND mode_takeaway = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid take-away token'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  trial_ok := public.cafeteria_trial_active(cafe.ref_code);
  SELECT points_balance INTO cafe_balance FROM public.cafeterias WHERE ref_code = cafe.ref_code;

  -- compute total
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID AND cafeteria_ref_code = cafe.ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;
    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = 'take_away';
    ovr_found := FOUND;
    IF ovr_found AND ovr.is_visible = false THEN RAISE EXCEPTION 'Item not available'; END IF;
    effective_price := NULL;
    IF ovr_found AND ovr.price IS NOT NULL THEN effective_price := ovr.price; END IF;
    IF effective_price IS NULL THEN effective_price := mi.price; END IF;
    grand := grand + (effective_price * qty);
  END LOOP;
  IF grand <= 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  IF NOT trial_ok AND (cafe_balance IS NULL OR cafe_balance < grand) THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: cafeteria balance is insufficient for this order';
  END IF;

  -- generate unique short code (retry a few times)
  FOR i IN 1..8 LOOP
    short_code := upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 4));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.orders
       WHERE cafeteria_ref_code = cafe.ref_code AND table_label = short_code
         AND status NOT IN ('paid','cancelled','served')
    );
  END LOOP;

  INSERT INTO public.orders (cafeteria_ref_code, table_id, table_label, customer_name, customer_phone, notes, total, status, mode)
  VALUES (cafe.ref_code, NULL, short_code, NULLIF(_customer_name,''), NULLIF(_customer_phone,''), NULLIF(_notes,''), grand, 'awaiting_payment', 'take_away')
  RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID AND cafeteria_ref_code = cafe.ref_code AND is_available = true;
    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = 'take_away';
    ovr_found := FOUND;
    effective_price := NULL; effective_name := mi.name;
    IF ovr_found THEN
      IF ovr.price IS NOT NULL THEN effective_price := ovr.price; END IF;
      IF ovr.name  IS NOT NULL THEN effective_name  := ovr.name;  END IF;
    END IF;
    IF effective_price IS NULL THEN effective_price := mi.price; END IF;
    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
    VALUES (new_order_id, mi.id, effective_name, effective_price, qty, NULLIF(it->>'notes',''));
  END LOOP;

  RETURN jsonb_build_object('order_id', new_order_id, 'short_code', short_code);
END;
$function$;

-- get_takeaway_order_status
CREATE OR REPLACE FUNCTION public.get_takeaway_order_status(_order_id uuid)
 RETURNS TABLE(status order_status, short_code text, total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT o.status, o.table_label, o.total
    FROM public.orders o
   WHERE o.id = _order_id AND o.mode = 'take_away'
   LIMIT 1;
$$;

-- get_pickup_board
CREATE OR REPLACE FUNCTION public.get_pickup_board(_cafe_ref text)
 RETURNS TABLE(short_code text, customer_name text, ready_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT o.table_label, o.customer_name, o.updated_at
    FROM public.orders o
   WHERE o.cafeteria_ref_code = _cafe_ref
     AND o.mode = 'take_away'
     AND o.status = 'ready'
   ORDER BY o.updated_at DESC
   LIMIT 50;
$$;

-- Extend set_order_status with take-away transitions
CREATE OR REPLACE FUNCTION public.set_order_status(_order_id uuid, _new_status order_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
  my_role app_role;
  is_admin boolean;
  is_manager boolean;
  is_waiter boolean;
  is_chef boolean;
  has_active_shift boolean;
  needs_chef boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  is_admin   := o.cafeteria_ref_code = public.get_my_cafeteria_ref_code();
  is_manager := o.cafeteria_ref_code = public.get_my_manager_cafeteria_ref();

  SELECT role INTO my_role FROM public.staff
    WHERE user_id = auth.uid() AND cafeteria_ref_code = o.cafeteria_ref_code AND is_active = true LIMIT 1;
  is_waiter := my_role = 'waiter';
  is_chef   := my_role = 'chef';

  IF NOT (is_admin OR is_manager OR is_waiter OR is_chef) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF (is_waiter OR is_chef) THEN
    SELECT EXISTS(SELECT 1 FROM public.shifts WHERE staff_user_id = auth.uid() AND status = 'active')
      INTO has_active_shift;
    IF NOT has_active_shift THEN RAISE EXCEPTION 'Active shift required'; END IF;
  END IF;

  IF _new_status = 'cancelled' THEN
    IF NOT (is_admin OR is_manager OR is_waiter) THEN RAISE EXCEPTION 'Not allowed to cancel'; END IF;
    IF o.status NOT IN ('new','preparing','awaiting_payment','paid_at_counter') THEN RAISE EXCEPTION 'Cannot cancel in this status'; END IF;
    UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = _order_id;
    RETURN;
  END IF;

  IF is_admin OR is_manager THEN
    UPDATE public.orders SET status = _new_status, updated_at = now() WHERE id = _order_id;
    RETURN;
  END IF;

  IF is_waiter THEN
    IF o.status = 'awaiting_payment' AND _new_status = 'paid_at_counter' THEN
      UPDATE public.orders SET status = 'paid_at_counter', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'new' AND _new_status = 'preparing' THEN
      UPDATE public.orders SET status = 'preparing', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'preparing' AND _new_status = 'ready' THEN
      needs_chef := public.order_requires_chef(_order_id);
      IF needs_chef THEN
        RAISE EXCEPTION 'CHEF_REQUIRED: this order has chef items, only chef can mark ready';
      END IF;
      UPDATE public.orders SET status = 'ready', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'ready' AND _new_status = 'served' THEN
      UPDATE public.orders SET status = 'served', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'served' AND _new_status = 'paid' THEN
      UPDATE public.orders SET status = 'paid', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Invalid waiter transition % -> %', o.status, _new_status;
  END IF;

  IF is_chef THEN
    IF o.status = 'paid_at_counter' AND _new_status = 'preparing' THEN
      UPDATE public.orders SET status = 'preparing', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'preparing' AND _new_status = 'ready' THEN
      UPDATE public.orders SET status = 'ready', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Invalid chef transition % -> %', o.status, _new_status;
  END IF;

  RAISE EXCEPTION 'Not authorized';
END;
$function$;
