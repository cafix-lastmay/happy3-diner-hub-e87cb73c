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

    effective_price := COALESCE(CASE WHEN ovr_found THEN ovr.price END, mi.price);
    effective_name := COALESCE(NULLIF(ovr.name,''), mi.name);

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
      VALUES (new_order_id, mi.id, effective_name, effective_price, qty, NULLIF(it->>'notes',''));
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