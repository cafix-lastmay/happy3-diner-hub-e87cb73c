
DO $$ BEGIN
  CREATE TYPE public.delivery_status AS ENUM (
    'pending_assignment','requested','accepted','rejected',
    'picked_up','on_the_way','delivered','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.delivery_fee_tier AS ENUM ('a','b','c');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.delivery_details (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  cafeteria_ref_code text NOT NULL,
  customer_name text,
  customer_phone text,
  customer_address text NOT NULL,
  customer_lat numeric,
  customer_lng numeric,
  fee_tier public.delivery_fee_tier,
  fee_amount numeric(12,2) NOT NULL DEFAULT 0,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  assigned_by uuid,
  status public.delivery_status NOT NULL DEFAULT 'pending_assignment',
  reject_reason text,
  requested_at timestamptz,
  responded_at timestamptz,
  picked_up_at timestamptz,
  on_the_way_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_details_driver ON public.delivery_details(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_details_cafe_status ON public.delivery_details(cafeteria_ref_code, status);

DROP TRIGGER IF EXISTS trg_delivery_details_updated_at ON public.delivery_details;
CREATE TRIGGER trg_delivery_details_updated_at
  BEFORE UPDATE ON public.delivery_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.delivery_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner views all delivery details" ON public.delivery_details;
CREATE POLICY "Owner views all delivery details" ON public.delivery_details
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Cafe staff view delivery details" ON public.delivery_details;
CREATE POLICY "Cafe staff view delivery details" ON public.delivery_details
  FOR SELECT USING (
    cafeteria_ref_code = public.get_my_cafeteria_ref_code()
    OR cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
    OR cafeteria_ref_code = public.get_my_staff_cafeteria_ref()
  );

DROP POLICY IF EXISTS "Driver views own delivery details" ON public.delivery_details;
CREATE POLICY "Driver views own delivery details" ON public.delivery_details
  FOR SELECT USING (driver_id = public.get_my_driver_id());

ALTER TABLE public.delivery_details REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='delivery_details';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_details';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.place_delivery_order(
  _takeaway_token text, _customer_name text, _customer_phone text,
  _customer_address text, _customer_lat numeric, _customer_lng numeric,
  _notes text, _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  IF _customer_phone IS NULL OR length(trim(_customer_phone)) = 0 THEN RAISE EXCEPTION 'PHONE_REQUIRED'; END IF;

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
  VALUES (new_order_id, cafe.ref_code, NULLIF(_customer_name,''), _customer_phone, _customer_address, _customer_lat, _customer_lng, 'pending_assignment');

  PERFORM public.create_notification(cafe.user_id, 'order.delivery_new',
    'New delivery order', 'A new delivery order needs a driver',
    jsonb_build_object('order_id', new_order_id, 'cafeteria_ref_code', cafe.ref_code));

  RETURN jsonb_build_object('order_id', new_order_id, 'short_code', short_code);
END $$;

CREATE OR REPLACE FUNCTION public.assign_delivery_driver(_order_id uuid, _driver_id uuid, _fee_tier text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE ord RECORD; cafe RECORD; drv RECORD; fee numeric(12,2) := 0; caller_cafe text;
BEGIN
  IF _fee_tier NOT IN ('a','b','c') THEN RAISE EXCEPTION 'Invalid fee tier'; END IF;
  SELECT * INTO ord FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF ord.mode <> 'delivery' THEN RAISE EXCEPTION 'Not a delivery order'; END IF;
  caller_cafe := COALESCE(public.get_my_cafeteria_ref_code(), public.get_my_manager_cafeteria_ref(), public.get_my_staff_cafeteria_ref());
  IF caller_cafe IS NULL OR caller_cafe <> ord.cafeteria_ref_code THEN RAISE EXCEPTION 'Not authorized for this cafeteria'; END IF;
  SELECT * INTO cafe FROM public.cafeterias WHERE ref_code = ord.cafeteria_ref_code;
  SELECT * INTO drv FROM public.drivers WHERE id = _driver_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Driver not available'; END IF;
  IF NOT (
    (drv.kind = 'staff' AND drv.cafeteria_ref_code = ord.cafeteria_ref_code)
    OR EXISTS (SELECT 1 FROM public.driver_cafeteria_links l
               WHERE l.driver_id = drv.id AND l.cafeteria_ref_code = ord.cafeteria_ref_code AND l.status = 'approved')
  ) THEN RAISE EXCEPTION 'Driver not linked to this cafeteria'; END IF;
  fee := CASE _fee_tier
    WHEN 'a' THEN COALESCE(cafe.delivery_fee_a_amount, 0)
    WHEN 'b' THEN COALESCE(cafe.delivery_fee_b_amount, 0)
    WHEN 'c' THEN COALESCE(cafe.delivery_fee_c_amount, 0)
  END;
  UPDATE public.delivery_details
     SET driver_id = drv.id, assigned_by = auth.uid(),
         fee_tier = _fee_tier::public.delivery_fee_tier,
         fee_amount = fee, status = 'requested',
         requested_at = now(), responded_at = NULL, reject_reason = NULL
   WHERE order_id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery details missing'; END IF;
  PERFORM public.create_notification(drv.user_id, 'order.delivery_requested',
    'New delivery request', 'You have a new delivery request',
    jsonb_build_object('order_id', _order_id, 'cafeteria_ref_code', ord.cafeteria_ref_code, 'fee_amount', fee));
END $$;

CREATE OR REPLACE FUNCTION public.respond_to_delivery(_order_id uuid, _accept boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE dd RECORD; ord RECORD; cafe RECORD; my_driver_id uuid;
BEGIN
  my_driver_id := public.get_my_driver_id();
  IF my_driver_id IS NULL THEN RAISE EXCEPTION 'Not a driver'; END IF;
  SELECT * INTO dd FROM public.delivery_details WHERE order_id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found'; END IF;
  IF dd.driver_id <> my_driver_id THEN RAISE EXCEPTION 'Not your delivery'; END IF;
  IF dd.status <> 'requested' THEN RAISE EXCEPTION 'Cannot respond at this stage'; END IF;
  SELECT * INTO ord FROM public.orders WHERE id = _order_id;
  SELECT * INTO cafe FROM public.cafeterias WHERE ref_code = ord.cafeteria_ref_code;
  IF _accept THEN
    UPDATE public.delivery_details SET status = 'accepted', responded_at = now() WHERE order_id = _order_id;
    UPDATE public.drivers SET status = 'busy' WHERE id = my_driver_id;
    PERFORM public.create_notification(cafe.user_id, 'order.delivery_accepted',
      'Driver accepted delivery', 'The driver is on the way to pick up',
      jsonb_build_object('order_id', _order_id, 'driver_id', my_driver_id));
    IF dd.assigned_by IS NOT NULL AND dd.assigned_by <> cafe.user_id THEN
      PERFORM public.create_notification(dd.assigned_by, 'order.delivery_accepted',
        'Driver accepted delivery', 'The driver accepted your delivery request',
        jsonb_build_object('order_id', _order_id, 'driver_id', my_driver_id));
    END IF;
  ELSE
    UPDATE public.delivery_details SET status = 'rejected', responded_at = now(),
      reject_reason = NULLIF(_reason,''), driver_id = NULL WHERE order_id = _order_id;
    PERFORM public.create_notification(cafe.user_id, 'order.delivery_rejected',
      'Driver rejected delivery', COALESCE('Reason: ' || _reason, 'Reassign a driver'),
      jsonb_build_object('order_id', _order_id));
    IF dd.assigned_by IS NOT NULL AND dd.assigned_by <> cafe.user_id THEN
      PERFORM public.create_notification(dd.assigned_by, 'order.delivery_rejected',
        'Driver rejected delivery', COALESCE('Reason: ' || _reason, 'Please reassign'),
        jsonb_build_object('order_id', _order_id));
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_delivery_status(_order_id uuid, _new_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE dd RECORD; ord RECORD; cafe RECORD; my_driver_id uuid; ns public.delivery_status;
BEGIN
  IF _new_status NOT IN ('picked_up','on_the_way','delivered') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  ns := _new_status::public.delivery_status;
  my_driver_id := public.get_my_driver_id();
  IF my_driver_id IS NULL THEN RAISE EXCEPTION 'Not a driver'; END IF;
  SELECT * INTO dd FROM public.delivery_details WHERE order_id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found'; END IF;
  IF dd.driver_id <> my_driver_id THEN RAISE EXCEPTION 'Not your delivery'; END IF;
  IF NOT (
    (ns = 'picked_up'  AND dd.status = 'accepted') OR
    (ns = 'on_the_way' AND dd.status = 'picked_up') OR
    (ns = 'delivered'  AND dd.status = 'on_the_way')
  ) THEN RAISE EXCEPTION 'Invalid status transition from % to %', dd.status, ns; END IF;
  SELECT * INTO ord FROM public.orders WHERE id = _order_id;
  SELECT * INTO cafe FROM public.cafeterias WHERE ref_code = ord.cafeteria_ref_code;
  UPDATE public.delivery_details
     SET status = ns,
         picked_up_at  = CASE WHEN ns='picked_up'  THEN now() ELSE picked_up_at  END,
         on_the_way_at = CASE WHEN ns='on_the_way' THEN now() ELSE on_the_way_at END,
         delivered_at  = CASE WHEN ns='delivered'  THEN now() ELSE delivered_at  END
   WHERE order_id = _order_id;
  IF ns = 'delivered' THEN
    UPDATE public.drivers SET status = 'available' WHERE id = my_driver_id;
    UPDATE public.orders SET status = 'served' WHERE id = _order_id AND status NOT IN ('paid','cancelled');
  END IF;
  PERFORM public.create_notification(cafe.user_id, 'order.delivery_status',
    'Delivery status: ' || ns::text, NULL,
    jsonb_build_object('order_id', _order_id, 'status', ns::text));
  IF dd.assigned_by IS NOT NULL AND dd.assigned_by <> cafe.user_id THEN
    PERFORM public.create_notification(dd.assigned_by, 'order.delivery_status',
      'Delivery status: ' || ns::text, NULL,
      jsonb_build_object('order_id', _order_id, 'status', ns::text));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_delivery(_order_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE dd RECORD; ord RECORD; caller_cafe text;
BEGIN
  SELECT * INTO dd FROM public.delivery_details WHERE order_id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery not found'; END IF;
  SELECT * INTO ord FROM public.orders WHERE id = _order_id;
  caller_cafe := COALESCE(public.get_my_cafeteria_ref_code(), public.get_my_manager_cafeteria_ref(), public.get_my_staff_cafeteria_ref());
  IF caller_cafe IS NULL OR caller_cafe <> ord.cafeteria_ref_code THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF dd.status IN ('delivered','cancelled') THEN RAISE EXCEPTION 'Already finalized'; END IF;
  IF dd.status IN ('picked_up','on_the_way') THEN RAISE EXCEPTION 'Cannot cancel after pickup'; END IF;
  UPDATE public.delivery_details SET status='cancelled', cancelled_at=now(), reject_reason=NULLIF(_reason,'') WHERE order_id = _order_id;
  UPDATE public.orders SET status='cancelled' WHERE id = _order_id AND status NOT IN ('paid','served');
  IF dd.driver_id IS NOT NULL THEN
    UPDATE public.drivers SET status='available' WHERE id = dd.driver_id AND status='busy';
    PERFORM public.create_notification((SELECT user_id FROM public.drivers WHERE id = dd.driver_id),
      'order.delivery_cancelled', 'Delivery cancelled', _reason,
      jsonb_build_object('order_id', _order_id));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_delivery_order_status(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE ord RECORD; dd RECORD; drv RECORD; cafe RECORD; driver_info jsonb := NULL;
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO dd FROM public.delivery_details WHERE order_id = _order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO cafe FROM public.cafeterias WHERE ref_code = ord.cafeteria_ref_code;
  IF dd.driver_id IS NOT NULL AND dd.status IN ('accepted','picked_up','on_the_way','delivered') THEN
    SELECT * INTO drv FROM public.drivers WHERE id = dd.driver_id;
    IF FOUND THEN
      driver_info := jsonb_build_object('name', drv.full_name, 'phone', drv.phone,
        'photo_url', drv.photo_url, 'vehicle_type', drv.vehicle_type, 'rating_avg', drv.rating_avg);
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'order_id', ord.id, 'short_code', ord.table_label, 'order_status', ord.status,
    'delivery_status', dd.status, 'fee_amount', dd.fee_amount, 'total', ord.total,
    'eta_minutes', cafe.estimated_delivery_minutes,
    'requested_at', dd.requested_at, 'responded_at', dd.responded_at,
    'picked_up_at', dd.picked_up_at, 'on_the_way_at', dd.on_the_way_at,
    'delivered_at', dd.delivered_at, 'driver', driver_info
  );
END $$;

CREATE OR REPLACE FUNCTION public.list_available_drivers_for_cafeteria()
RETURNS TABLE (id uuid, full_name text, phone text, photo_url text,
  vehicle_type text, rating_avg numeric, status text, kind text,
  current_lat numeric, current_lng numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE caller_cafe text;
BEGIN
  caller_cafe := COALESCE(public.get_my_cafeteria_ref_code(), public.get_my_manager_cafeteria_ref(), public.get_my_staff_cafeteria_ref());
  IF caller_cafe IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT d.id, d.full_name, d.phone, d.photo_url, d.vehicle_type, d.rating_avg, d.status, d.kind, d.current_lat, d.current_lng
  FROM public.drivers d
  WHERE d.is_active = true
    AND ((d.kind = 'staff' AND d.cafeteria_ref_code = caller_cafe)
         OR EXISTS (SELECT 1 FROM public.driver_cafeteria_links l
                    WHERE l.driver_id = d.id AND l.cafeteria_ref_code = caller_cafe AND l.status = 'approved'))
  ORDER BY (d.status = 'available') DESC, d.rating_avg DESC NULLS LAST, d.full_name;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_active_deliveries()
RETURNS TABLE (order_id uuid, short_code text, cafeteria_ref_code text, cafeteria_name text,
  cafeteria_address text, cafeteria_lat numeric, cafeteria_lng numeric,
  customer_name text, customer_phone text, customer_address text,
  customer_lat numeric, customer_lng numeric, fee_amount numeric, fee_tier text,
  order_total numeric, status text,
  requested_at timestamptz, responded_at timestamptz,
  picked_up_at timestamptz, on_the_way_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE my_id uuid;
BEGIN
  my_id := public.get_my_driver_id();
  IF my_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT dd.order_id, o.table_label, dd.cafeteria_ref_code, c.name, c.address, c.lat, c.lng,
         dd.customer_name, dd.customer_phone, dd.customer_address, dd.customer_lat, dd.customer_lng,
         dd.fee_amount, dd.fee_tier::text, o.total, dd.status::text,
         dd.requested_at, dd.responded_at, dd.picked_up_at, dd.on_the_way_at
  FROM public.delivery_details dd
  JOIN public.orders o ON o.id = dd.order_id
  JOIN public.cafeterias c ON c.ref_code = dd.cafeteria_ref_code
  WHERE dd.driver_id = my_id
    AND dd.status IN ('requested','accepted','picked_up','on_the_way')
  ORDER BY dd.requested_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.place_delivery_order(text,text,text,text,numeric,numeric,text,jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_delivery_driver(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_delivery(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_delivery(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_order_status(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_available_drivers_for_cafeteria() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_active_deliveries() TO authenticated;
