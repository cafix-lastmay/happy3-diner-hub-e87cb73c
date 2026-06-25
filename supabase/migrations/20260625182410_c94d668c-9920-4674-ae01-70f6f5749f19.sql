CREATE OR REPLACE FUNCTION public.request_order_addition(_order_id uuid, _phone text, _items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  phone_clean text := NULLIF(trim(COALESCE(_phone,'')),'');
  o RECORD; it jsonb; mi RECORD; sid uuid; qty int;
  created_ids uuid[] := '{}';
  new_id uuid;
  cafe_owner uuid;
  preview text := '';
BEGIN
  IF phone_clean IS NULL THEN RAISE EXCEPTION 'PHONE_REQUIRED'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id AND customer_phone = phone_clean;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.status NOT IN ('new'::order_status, 'awaiting_payment'::order_status, 'preparing'::order_status) THEN
    RAISE EXCEPTION 'ORDER_NOT_EDITABLE';
  END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'EMPTY_REQUEST'; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::int, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::uuid AND cafeteria_ref_code = o.cafeteria_ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_AVAILABLE'; END IF;
    sid := NULLIF(it->>'size_id','')::uuid;
    INSERT INTO public.order_addition_requests (order_id, cafeteria_ref_code, menu_item_id, size_id, quantity, notes, requested_phone)
      VALUES (_order_id, o.cafeteria_ref_code, mi.id, sid, qty, NULLIF(it->>'notes',''), phone_clean)
      RETURNING id INTO new_id;
    created_ids := created_ids || new_id;
    preview := preview || '• ' || mi.name || ' × ' || qty || E'\n';
  END LOOP;

  SELECT user_id INTO cafe_owner FROM public.cafeterias WHERE ref_code = o.cafeteria_ref_code;
  IF cafe_owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (cafe_owner, 'order_addition_request',
            'طلب إضافة صنف لطلب قائم',
            'طلب #' || RIGHT(_order_id::text, 6) || E'\n' || preview,
            jsonb_build_object('order_id', _order_id, 'request_ids', to_jsonb(created_ids)));
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_ids', to_jsonb(created_ids));
END $function$;