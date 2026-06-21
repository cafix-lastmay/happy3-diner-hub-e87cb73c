
-- ============================================================
-- 1. customer_addresses — support guest (phone-based) records
-- ============================================================
ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ALTER COLUMN user_id DROP NOT NULL;

-- Either user_id (logged-in) or phone_number (guest) must be present
ALTER TABLE public.customer_addresses
  DROP CONSTRAINT IF EXISTS customer_addresses_owner_check;
ALTER TABLE public.customer_addresses
  ADD CONSTRAINT customer_addresses_owner_check
  CHECK (user_id IS NOT NULL OR phone_number IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_phone_uidx
  ON public.customer_addresses (phone_number)
  WHERE phone_number IS NOT NULL AND user_id IS NULL;

-- Allow anon/auth to upsert their own guest record by phone via RPC only.
-- We do NOT add broad anon SELECT on this table.

-- ============================================================
-- 2. Updated place_order_takeaway with phone + auto-save address
-- ============================================================
CREATE OR REPLACE FUNCTION public.place_order_takeaway(
  _token text, _customer_name text, _notes text, _items jsonb,
  _payment_method text DEFAULT NULL,
  _payer_wallet_number text DEFAULT NULL,
  _payment_proof_url text DEFAULT NULL,
  _customer_phone text DEFAULT NULL,
  _customer_address text DEFAULT NULL,
  _customer_lat numeric DEFAULT NULL,
  _customer_lng numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cafe RECORD; it jsonb; mi RECORD; qty int;
  grand numeric(12,2) := 0; new_order_id uuid;
  ovr RECORD; ovr_found boolean;
  effective_price numeric(12,2); effective_name text;
  sz RECORD; sid uuid; line_size_name text;
  phone_clean text := NULLIF(trim(COALESCE(_customer_phone,'')),'');
BEGIN
  IF _customer_name IS NULL OR length(trim(_customer_name))=0 THEN RAISE EXCEPTION 'CUSTOMER_NAME_REQUIRED'; END IF;

  SELECT * INTO cafe FROM public.cafeterias
    WHERE takeaway_qr_token = _token AND is_active = true AND mode_takeaway = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid takeaway token'; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN
    RAISE EXCEPTION 'CAFETERIA_BLOCKED: cafeteria is suspended — recharge required';
  END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_label, mode, status, customer_name, customer_phone, notes, total,
                             payment_method, payer_wallet_number, payment_proof_url)
    VALUES (cafe.ref_code, 'Takeaway', 'take_away'::order_mode, 'awaiting_payment'::order_status,
            trim(_customer_name), phone_clean, _notes, 0,
            NULLIF(_payment_method,''), NULLIF(_payer_wallet_number,''), NULLIF(_payment_proof_url,''))
    RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::int,0);
    IF qty<=0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
     WHERE id = (it->>'item_id')::uuid AND cafeteria_ref_code = cafe.ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;
    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode='take_away'::order_mode;
    ovr_found := FOUND;
    IF ovr_found AND ovr.is_visible = false THEN RAISE EXCEPTION 'Item not available'; END IF;
    sid := CASE WHEN COALESCE(mi.sizes_enabled,false) THEN NULLIF(it->>'size_id','')::uuid ELSE NULL END;
    line_size_name := NULL;
    IF sid IS NOT NULL THEN
      SELECT * INTO sz FROM public.menu_item_sizes WHERE id=sid AND menu_item_id=mi.id AND is_available=true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Size not available'; END IF;
      effective_price := COALESCE(sz.price_takeaway, sz.price);
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

  IF cafe.tax_apply_takeaway = true AND cafe.tax_percent > 0 THEN grand := grand + (grand * cafe.tax_percent / 100); END IF;
  IF cafe.service_percent > 0 THEN grand := grand + (grand * cafe.service_percent / 100); END IF;
  UPDATE public.orders SET total = grand WHERE id = new_order_id;

  -- Save guest details
  IF phone_clean IS NOT NULL THEN
    INSERT INTO public.customer_addresses (user_id, phone_number, customer_name, address, lat, lng, is_default)
      VALUES (NULL, phone_clean, trim(_customer_name),
              COALESCE(NULLIF(trim(COALESCE(_customer_address,'')),''),'-'),
              _customer_lat, _customer_lng, true)
    ON CONFLICT (phone_number) WHERE phone_number IS NOT NULL AND user_id IS NULL
    DO UPDATE SET customer_name = EXCLUDED.customer_name,
                  address = CASE WHEN EXCLUDED.address <> '-' THEN EXCLUDED.address ELSE public.customer_addresses.address END,
                  lat = COALESCE(EXCLUDED.lat, public.customer_addresses.lat),
                  lng = COALESCE(EXCLUDED.lng, public.customer_addresses.lng),
                  updated_at = now();
  END IF;

  RETURN new_order_id;
END $function$;

-- ============================================================
-- 3. Updated place_order_delivery with phone + auto-save
-- ============================================================
CREATE OR REPLACE FUNCTION public.place_order_delivery(
  _token text, _customer_name text, _customer_address text,
  _customer_lat numeric, _customer_lng numeric, _notes text, _items jsonb,
  _payment_method text DEFAULT NULL,
  _payer_wallet_number text DEFAULT NULL,
  _payment_proof_url text DEFAULT NULL,
  _customer_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  cafe RECORD; it jsonb; mi RECORD; qty int;
  grand numeric(12,2) := 0; new_order_id uuid;
  ovr RECORD; ovr_found boolean;
  effective_price numeric(12,2); effective_name text;
  tax_val numeric(12,2) := 0; svc_val numeric(12,2) := 0;
  sz RECORD; sid uuid; line_size_name text;
  phone_clean text := NULLIF(trim(COALESCE(_customer_phone,'')),'');
BEGIN
  IF _customer_name IS NULL OR length(trim(_customer_name))=0 THEN RAISE EXCEPTION 'CUSTOMER_NAME_REQUIRED'; END IF;
  IF _customer_address IS NULL OR length(trim(_customer_address))=0 THEN RAISE EXCEPTION 'CUSTOMER_ADDRESS_REQUIRED'; END IF;

  SELECT * INTO cafe FROM public.cafeterias
    WHERE delivery_qr_token = _token AND is_active = true AND mode_delivery = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid delivery token'; END IF;
  IF public.cafeteria_is_blocked(cafe.ref_code) THEN
    RAISE EXCEPTION 'CAFETERIA_BLOCKED: cafeteria is suspended — recharge required';
  END IF;
  IF jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_label, mode, status, customer_name, customer_phone, notes, total,
                             payment_method, payer_wallet_number, payment_proof_url)
    VALUES (cafe.ref_code, 'Delivery', 'delivery'::order_mode, 'new'::order_status,
            trim(_customer_name), phone_clean, _notes, 0,
            NULLIF(_payment_method,''), NULLIF(_payer_wallet_number,''), NULLIF(_payment_proof_url,''))
    RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::int,0);
    IF qty<=0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
     WHERE id = (it->>'item_id')::uuid AND cafeteria_ref_code = cafe.ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;
    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode='delivery'::order_mode;
    ovr_found := FOUND;
    IF ovr_found AND ovr.is_visible = false THEN RAISE EXCEPTION 'Item not available'; END IF;
    sid := CASE WHEN COALESCE(mi.sizes_enabled,false) THEN NULLIF(it->>'size_id','')::uuid ELSE NULL END;
    line_size_name := NULL;
    IF sid IS NOT NULL THEN
      SELECT * INTO sz FROM public.menu_item_sizes WHERE id=sid AND menu_item_id=mi.id AND is_available=true;
      IF NOT FOUND THEN RAISE EXCEPTION 'Size not available'; END IF;
      effective_price := COALESCE(sz.price_delivery, sz.price);
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

  INSERT INTO public.delivery_details (order_id, cafeteria_ref_code, customer_name, customer_phone, customer_address, customer_lat, customer_lng)
    VALUES (new_order_id, cafe.ref_code, trim(_customer_name), phone_clean, trim(_customer_address), _customer_lat, _customer_lng)
    ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.orders SET total = grand + tax_val + svc_val WHERE id = new_order_id;

  -- Save guest details
  IF phone_clean IS NOT NULL THEN
    INSERT INTO public.customer_addresses (user_id, phone_number, customer_name, address, lat, lng, is_default)
      VALUES (NULL, phone_clean, trim(_customer_name), trim(_customer_address), _customer_lat, _customer_lng, true)
    ON CONFLICT (phone_number) WHERE phone_number IS NOT NULL AND user_id IS NULL
    DO UPDATE SET customer_name = EXCLUDED.customer_name,
                  address = EXCLUDED.address,
                  lat = COALESCE(EXCLUDED.lat, public.customer_addresses.lat),
                  lng = COALESCE(EXCLUDED.lng, public.customer_addresses.lng),
                  updated_at = now();
  END IF;

  RETURN new_order_id;
END $function$;

-- ============================================================
-- 4. RPC: get_customer_orders(phone, ref_code) — past orders
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customer_orders(_phone text, _ref_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  phone_clean text := NULLIF(trim(COALESCE(_phone,'')),'');
  result jsonb;
BEGIN
  IF phone_clean IS NULL OR length(phone_clean) < 6 THEN
    RAISE EXCEPTION 'PHONE_REQUIRED';
  END IF;
  IF _ref_code IS NULL OR length(trim(_ref_code))=0 THEN
    RAISE EXCEPTION 'REF_CODE_REQUIRED';
  END IF;

  SELECT COALESCE(jsonb_agg(o ORDER BY o.created_at DESC), '[]'::jsonb) INTO result FROM (
    SELECT o.id, o.created_at, o.status, o.mode, o.total, o.customer_name, o.customer_phone,
           o.payment_method, o.notes,
           (SELECT jsonb_agg(jsonb_build_object('name', oi.name_snapshot, 'qty', oi.qty, 'price', oi.price_snapshot))
              FROM public.order_items oi WHERE oi.order_id = o.id) AS items
    FROM public.orders o
    WHERE o.cafeteria_ref_code = _ref_code
      AND o.customer_phone = phone_clean
    ORDER BY o.created_at DESC
    LIMIT 50
  ) o;

  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_customer_orders(text, text) TO anon, authenticated;

-- ============================================================
-- 5. RPC: get_customer_order(order_id, phone) — single tracking
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customer_order(_order_id uuid, _phone text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  phone_clean text := NULLIF(trim(COALESCE(_phone,'')),'');
  o RECORD;
BEGIN
  IF phone_clean IS NULL THEN RAISE EXCEPTION 'PHONE_REQUIRED'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id AND customer_phone = phone_clean;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN jsonb_build_object(
    'id', o.id, 'created_at', o.created_at, 'status', o.status, 'mode', o.mode,
    'total', o.total, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'cafeteria_ref_code', o.cafeteria_ref_code, 'notes', o.notes,
    'payment_method', o.payment_method,
    'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', oi.id, 'name', oi.name_snapshot, 'qty', oi.qty, 'price', oi.price_snapshot)), '[]'::jsonb)
                FROM public.order_items oi WHERE oi.order_id = o.id),
    'addition_requests', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.addition_status, 'qty', r.quantity, 'name', mi.name, 'size_name', sz.name, 'created_at', r.created_at, 'reject_reason', r.reject_reason) ORDER BY r.created_at DESC), '[]'::jsonb)
                            FROM public.order_addition_requests r
                            LEFT JOIN public.menu_items mi ON mi.id = r.menu_item_id
                            LEFT JOIN public.menu_item_sizes sz ON sz.id = r.size_id
                            WHERE r.order_id = o.id)
  );
END $$;

-- ============================================================
-- 6. order_addition_requests table
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.order_addition_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.order_addition_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cafeteria_ref_code text NOT NULL,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id),
  size_id uuid REFERENCES public.menu_item_sizes(id),
  quantity int NOT NULL CHECK (quantity > 0),
  notes text,
  addition_status public.order_addition_status NOT NULL DEFAULT 'pending',
  reject_reason text,
  requested_phone text,
  responded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.order_addition_requests TO authenticated;
GRANT ALL ON public.order_addition_requests TO service_role;

ALTER TABLE public.order_addition_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cafe owner/manager views addition requests"
ON public.order_addition_requests FOR SELECT TO authenticated
USING (
  cafeteria_ref_code = public.get_my_cafeteria_ref_code()
  OR cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
);

CREATE POLICY "Cafe owner/manager updates addition requests"
ON public.order_addition_requests FOR UPDATE TO authenticated
USING (
  cafeteria_ref_code = public.get_my_cafeteria_ref_code()
  OR cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
);

CREATE INDEX IF NOT EXISTS oar_order_idx ON public.order_addition_requests(order_id);
CREATE INDEX IF NOT EXISTS oar_cafe_status_idx ON public.order_addition_requests(cafeteria_ref_code, addition_status);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_addition_requests;

-- ============================================================
-- 7. RPC: request_order_addition(order_id, phone, items[])
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_order_addition(
  _order_id uuid, _phone text, _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  IF o.status NOT IN ('new'::order_status, 'awaiting_payment'::order_status, 'preparing'::order_status, 'pending'::order_status) THEN
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

  -- Notify cafeteria owner
  SELECT user_id INTO cafe_owner FROM public.cafeterias WHERE ref_code = o.cafeteria_ref_code;
  IF cafe_owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, data)
    VALUES (cafe_owner, 'order_addition_request',
            'طلب إضافة صنف لطلب قائم',
            'طلب #' || RIGHT(_order_id::text, 6) || E'\n' || preview,
            jsonb_build_object('order_id', _order_id, 'request_ids', to_jsonb(created_ids)));
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_ids', to_jsonb(created_ids));
END $$;

GRANT EXECUTE ON FUNCTION public.request_order_addition(uuid, text, jsonb) TO anon, authenticated;

-- ============================================================
-- 8. RPC: respond_order_addition(request_id, approve, reason)
-- ============================================================
CREATE OR REPLACE FUNCTION public.respond_order_addition(
  _request_id uuid, _approve boolean, _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r RECORD; mi RECORD; sz RECORD; o RECORD;
  effective_price numeric(12,2); effective_name text; line_size_name text;
  add_total numeric(12,2) := 0;
  caller_ref text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO r FROM public.order_addition_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.addition_status <> 'pending' THEN RAISE EXCEPTION 'ALREADY_RESPONDED'; END IF;

  caller_ref := public.get_my_cafeteria_ref_code();
  IF caller_ref IS NULL OR caller_ref <> r.cafeteria_ref_code THEN
    caller_ref := public.get_my_manager_cafeteria_ref();
    IF caller_ref IS NULL OR caller_ref <> r.cafeteria_ref_code THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = r.order_id;

  IF _approve THEN
    SELECT * INTO mi FROM public.menu_items WHERE id = r.menu_item_id;
    line_size_name := NULL;
    IF r.size_id IS NOT NULL THEN
      SELECT * INTO sz FROM public.menu_item_sizes WHERE id = r.size_id;
      IF FOUND THEN
        effective_price := CASE WHEN o.mode = 'delivery'::order_mode THEN COALESCE(sz.price_delivery, sz.price)
                                WHEN o.mode = 'take_away'::order_mode THEN COALESCE(sz.price_takeaway, sz.price)
                                ELSE sz.price END;
        line_size_name := sz.name;
      ELSE
        effective_price := mi.price;
      END IF;
    ELSE
      effective_price := mi.price;
    END IF;
    effective_name := mi.name;
    IF line_size_name IS NOT NULL THEN effective_name := effective_name || ' — ' || line_size_name; END IF;

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes, size_id, size_name, unit_price)
      VALUES (r.order_id, mi.id, effective_name, effective_price, r.quantity, r.notes, r.size_id, line_size_name, effective_price);
    add_total := effective_price * r.quantity;
    UPDATE public.orders SET total = total + add_total, updated_at = now() WHERE id = r.order_id;
    UPDATE public.order_addition_requests
      SET addition_status='approved', responded_by=auth.uid(), responded_at=now()
      WHERE id=_request_id;
  ELSE
    UPDATE public.order_addition_requests
      SET addition_status='rejected', reject_reason=_reason, responded_by=auth.uid(), responded_at=now()
      WHERE id=_request_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'approved', _approve);
END $$;

GRANT EXECUTE ON FUNCTION public.respond_order_addition(uuid, boolean, text) TO authenticated;
