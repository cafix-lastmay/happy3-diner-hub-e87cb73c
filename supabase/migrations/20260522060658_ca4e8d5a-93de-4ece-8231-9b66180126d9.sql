-- Fix submit_item_ratings: verify caller identity for take_away and dine_in too.
-- For take_away and dine_in we now require the supplied phone to match
-- orders.customer_phone (digits-only). Dine-in orders without a recorded
-- customer phone cannot be rated via this anonymous path.
CREATE OR REPLACE FUNCTION public.submit_item_ratings(_order_id uuid, _customer_phone text, _ratings jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text; v_status delivery_status; v_cafe text; v_order_mode order_mode;
  v_norm_in text; v_norm_db text; r jsonb; v_item_id uuid; v_stars int; v_comment text;
BEGIN
  SELECT o.cafeteria_ref_code, o.mode, o.customer_phone INTO v_cafe, v_order_mode, v_phone
  FROM public.orders o WHERE o.id = _order_id;
  IF v_cafe IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_order_mode = 'delivery' THEN
    SELECT customer_phone, status INTO v_phone, v_status
    FROM public.delivery_details WHERE order_id = _order_id;
    IF v_phone IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_status <> 'delivered' THEN RAISE EXCEPTION 'NOT_DELIVERED'; END IF;
  END IF;

  -- Require phone match for ALL order modes to prevent fake ratings via
  -- a leaked order UUID. Dine-in/take-away orders without a recorded
  -- customer phone cannot be rated through this anonymous RPC.
  IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) = 0 THEN
    RAISE EXCEPTION 'PHONE_REQUIRED';
  END IF;
  v_norm_in := regexp_replace(COALESCE(_customer_phone,''), '\D', '', 'g');
  v_norm_db := regexp_replace(v_phone, '\D', '', 'g');
  IF v_norm_in <> v_norm_db THEN RAISE EXCEPTION 'PHONE_MISMATCH'; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_ratings, '[]'::jsonb))
  LOOP
    v_item_id := (r->>'item_id')::uuid;
    v_stars := COALESCE((r->>'stars')::int, 0);
    v_comment := NULLIF(r->>'comment', '');
    IF v_stars NOT BETWEEN 1 AND 5 THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = _order_id AND oi.item_id = v_item_id) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.ratings (target_kind, target_ref, order_id, customer_phone, stars, comment)
    VALUES ('menu_item', v_item_id::text, _order_id, _customer_phone, v_stars, v_comment)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $function$;

-- Fix get_delivery_order_status: stop returning driver PII (name/phone/photo)
-- to anyone holding the order UUID. Driver details are now only returned
-- when the caller supplies the matching customer_phone. Non-PII status
-- fields remain accessible so the customer tracker page still works.
CREATE OR REPLACE FUNCTION public.get_delivery_order_status(_order_id uuid, _customer_phone text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ord RECORD; dd RECORD; drv RECORD; cafe RECORD;
  driver_info jsonb := NULL; driver_id_out uuid := NULL;
  v_norm_in text; v_norm_db text; v_phone_ok boolean := false;
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO dd FROM public.delivery_details WHERE order_id = _order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO cafe FROM public.cafeterias WHERE ref_code = ord.cafeteria_ref_code;

  v_norm_in := regexp_replace(COALESCE(_customer_phone,''), '\D', '', 'g');
  v_norm_db := regexp_replace(COALESCE(dd.customer_phone,''), '\D', '', 'g');
  v_phone_ok := (length(v_norm_in) > 0 AND v_norm_in = v_norm_db);

  IF dd.driver_id IS NOT NULL AND dd.status IN ('accepted','picked_up','on_the_way','delivered') THEN
    SELECT * INTO drv FROM public.drivers WHERE id = dd.driver_id;
    IF FOUND THEN
      driver_id_out := drv.id;
      IF v_phone_ok THEN
        driver_info := jsonb_build_object('name', drv.full_name, 'phone', drv.phone,
          'photo_url', drv.photo_url, 'vehicle_type', drv.vehicle_type, 'rating_avg', drv.rating_avg);
      ELSE
        -- Redacted payload for unverified callers
        driver_info := jsonb_build_object('vehicle_type', drv.vehicle_type, 'rating_avg', drv.rating_avg);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_id', ord.id, 'short_code', ord.table_label, 'order_status', ord.status,
    'delivery_status', dd.status, 'fee_amount', dd.fee_amount, 'total', ord.total,
    'eta_minutes', cafe.estimated_delivery_minutes,
    'requested_at', dd.requested_at, 'responded_at', dd.responded_at,
    'picked_up_at', dd.picked_up_at, 'on_the_way_at', dd.on_the_way_at,
    'delivered_at', dd.delivered_at, 'driver', driver_info, 'driver_id', driver_id_out
  );
END $function$;