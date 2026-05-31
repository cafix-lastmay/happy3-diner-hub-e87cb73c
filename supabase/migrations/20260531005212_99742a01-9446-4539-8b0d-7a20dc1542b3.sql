DROP FUNCTION IF EXISTS public.place_order_takeaway(text, text, text, text, jsonb);

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
$function$;

NOTIFY pgrst, 'reload schema';