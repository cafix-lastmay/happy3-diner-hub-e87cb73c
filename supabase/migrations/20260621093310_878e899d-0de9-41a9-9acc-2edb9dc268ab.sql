
-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.payment_method_type AS ENUM ('cash_on_delivery','vodafone_cash','instapay');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.cafeteria_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_id uuid NOT NULL REFERENCES public.cafeterias(id) ON DELETE CASCADE,
  method public.payment_method_type NOT NULL,
  wallet_number text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cafeteria_id, method)
);

GRANT SELECT ON public.cafeteria_payment_methods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafeteria_payment_methods TO authenticated;
GRANT ALL ON public.cafeteria_payment_methods TO service_role;

ALTER TABLE public.cafeteria_payment_methods ENABLE ROW LEVEL SECURITY;

-- Helper: ref_code of the cafeteria row owned by current user (by cafe.id)
CREATE OR REPLACE FUNCTION public.cafe_ref_for_id(_cafe_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ref_code FROM public.cafeterias WHERE id = _cafe_id
$$;
GRANT EXECUTE ON FUNCTION public.cafe_ref_for_id(uuid) TO anon, authenticated, service_role;

CREATE POLICY "Public reads enabled payment methods"
  ON public.cafeteria_payment_methods FOR SELECT
  USING (is_enabled = true);

CREATE POLICY "Cafe admin manages payment methods"
  ON public.cafeteria_payment_methods FOR ALL
  USING (cafe_ref_for_id(cafeteria_id) = get_my_cafeteria_ref_code())
  WITH CHECK (cafe_ref_for_id(cafeteria_id) = get_my_cafeteria_ref_code());

CREATE POLICY "Manager manages payment methods"
  ON public.cafeteria_payment_methods FOR ALL
  USING (cafe_ref_for_id(cafeteria_id) = get_my_manager_cafeteria_ref())
  WITH CHECK (cafe_ref_for_id(cafeteria_id) = get_my_manager_cafeteria_ref());

CREATE POLICY "Owner views all payment methods"
  ON public.cafeteria_payment_methods FOR SELECT
  USING (has_role(auth.uid(), 'owner'::app_role));

CREATE OR REPLACE FUNCTION public.tg_cafeteria_payment_methods_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_cafeteria_payment_methods_updated_at ON public.cafeteria_payment_methods;
CREATE TRIGGER trg_cafeteria_payment_methods_updated_at
  BEFORE UPDATE ON public.cafeteria_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.tg_cafeteria_payment_methods_touch();

-- 3. Orders columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payer_wallet_number text,
  ADD COLUMN IF NOT EXISTS payment_proof_url text;

-- 4. Updated RPCs (drop old signatures, create new with payment params)
DROP FUNCTION IF EXISTS public.place_order_takeaway(text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.place_order_takeaway(
  _token text, _customer_name text, _notes text, _items jsonb,
  _payment_method text DEFAULT NULL, _payer_wallet_number text DEFAULT NULL, _payment_proof_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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

  INSERT INTO public.orders (cafeteria_ref_code, table_label, mode, status, customer_name, customer_phone, notes, total,
                             payment_method, payer_wallet_number, payment_proof_url)
    VALUES (cafe.ref_code, 'Takeaway', 'take_away'::order_mode, 'awaiting_payment'::order_status,
            trim(_customer_name), NULL, _notes, 0,
            NULLIF(_payment_method,''), NULLIF(_payer_wallet_number,''), NULLIF(_payment_proof_url,''))
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

    sid := CASE WHEN COALESCE(mi.sizes_enabled,false) THEN NULLIF(it->>'size_id','')::uuid ELSE NULL END;
    line_size_name := NULL;
    IF sid IS NOT NULL THEN
      SELECT * INTO sz FROM public.menu_item_sizes WHERE id = sid AND menu_item_id = mi.id AND is_available = true;
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

  IF cafe.tax_apply_takeaway = true AND cafe.tax_percent > 0 THEN
    grand := grand + (grand * cafe.tax_percent / 100);
  END IF;
  IF cafe.service_percent > 0 THEN
    grand := grand + (grand * cafe.service_percent / 100);
  END IF;
  UPDATE public.orders SET total = grand WHERE id = new_order_id;
  RETURN new_order_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.place_order_takeaway(text, text, text, jsonb, text, text, text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.place_order_delivery(text, text, text, numeric, numeric, text, jsonb);
CREATE OR REPLACE FUNCTION public.place_order_delivery(
  _token text, _customer_name text, _customer_address text, _customer_lat numeric, _customer_lng numeric,
  _notes text, _items jsonb,
  _payment_method text DEFAULT NULL, _payer_wallet_number text DEFAULT NULL, _payment_proof_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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

  INSERT INTO public.orders (cafeteria_ref_code, table_label, mode, status, customer_name, notes, total,
                             payment_method, payer_wallet_number, payment_proof_url)
    VALUES (cafe.ref_code, 'Delivery', 'delivery'::order_mode, 'new'::order_status,
            trim(_customer_name), _notes, 0,
            NULLIF(_payment_method,''), NULLIF(_payer_wallet_number,''), NULLIF(_payment_proof_url,''))
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

    sid := CASE WHEN COALESCE(mi.sizes_enabled,false) THEN NULLIF(it->>'size_id','')::uuid ELSE NULL END;
    line_size_name := NULL;
    IF sid IS NOT NULL THEN
      SELECT * INTO sz FROM public.menu_item_sizes WHERE id = sid AND menu_item_id = mi.id AND is_available = true;
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

  INSERT INTO public.delivery_details (order_id, cafeteria_ref_code, customer_name, customer_address, customer_lat, customer_lng)
    VALUES (new_order_id, cafe.ref_code, trim(_customer_name), trim(_customer_address), _customer_lat, _customer_lng)
    ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.orders SET total = grand + tax_val + svc_val WHERE id = new_order_id;
  RETURN new_order_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.place_order_delivery(text, text, text, numeric, numeric, text, jsonb, text, text, text) TO anon, authenticated, service_role;

-- 5. Storage policies for payment-proofs bucket
-- File path convention: <cafeteria_ref_code>/<order_or_uuid>.<ext>
-- Anyone may upload (customer placing order). Only cafe admin/manager + platform owner can read/list/delete.

DROP POLICY IF EXISTS "Anyone uploads payment proofs" ON storage.objects;
CREATE POLICY "Anyone uploads payment proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Cafe admin reads own payment proofs" ON storage.objects;
CREATE POLICY "Cafe admin reads own payment proofs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-proofs' AND (
      (storage.foldername(name))[1] = get_my_cafeteria_ref_code()
      OR (storage.foldername(name))[1] = get_my_manager_cafeteria_ref()
      OR has_role(auth.uid(), 'owner'::app_role)
    )
  );

DROP POLICY IF EXISTS "Cafe admin deletes own payment proofs" ON storage.objects;
CREATE POLICY "Cafe admin deletes own payment proofs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'payment-proofs' AND (
      (storage.foldername(name))[1] = get_my_cafeteria_ref_code()
      OR (storage.foldername(name))[1] = get_my_manager_cafeteria_ref()
      OR has_role(auth.uid(), 'owner'::app_role)
    )
  );
