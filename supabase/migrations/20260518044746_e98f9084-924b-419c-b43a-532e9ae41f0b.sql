
CREATE TABLE public.menu_mode_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  mode public.order_mode NOT NULL,
  name text,
  description text,
  image_url text,
  price numeric(12,2),
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, mode)
);
CREATE INDEX idx_menu_mode_overrides_item ON public.menu_mode_overrides(item_id);
CREATE INDEX idx_menu_mode_overrides_mode ON public.menu_mode_overrides(mode);
ALTER TABLE public.menu_mode_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cafe manages own item mode overrides" ON public.menu_mode_overrides
  FOR ALL USING (EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = menu_mode_overrides.item_id AND mi.cafeteria_ref_code = public.get_my_cafeteria_ref_code()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = menu_mode_overrides.item_id AND mi.cafeteria_ref_code = public.get_my_cafeteria_ref_code()));
CREATE POLICY "Manager manages item mode overrides" ON public.menu_mode_overrides
  FOR ALL USING (EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = menu_mode_overrides.item_id AND mi.cafeteria_ref_code = public.get_my_manager_cafeteria_ref()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = menu_mode_overrides.item_id AND mi.cafeteria_ref_code = public.get_my_manager_cafeteria_ref()));
CREATE POLICY "Staff views own cafe item mode overrides" ON public.menu_mode_overrides
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.menu_items mi WHERE mi.id = menu_mode_overrides.item_id AND mi.cafeteria_ref_code = public.get_my_staff_cafeteria_ref()));
CREATE POLICY "Owner views all item mode overrides" ON public.menu_mode_overrides
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE TRIGGER trg_menu_mode_overrides_updated_at
  BEFORE UPDATE ON public.menu_mode_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE TABLE public.category_mode_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  mode public.order_mode NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, mode)
);
CREATE INDEX idx_category_mode_visibility_cat ON public.category_mode_visibility(category_id);
ALTER TABLE public.category_mode_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cafe manages own category mode vis" ON public.category_mode_visibility
  FOR ALL USING (EXISTS (SELECT 1 FROM public.menu_categories c WHERE c.id = category_mode_visibility.category_id AND c.cafeteria_ref_code = public.get_my_cafeteria_ref_code()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_categories c WHERE c.id = category_mode_visibility.category_id AND c.cafeteria_ref_code = public.get_my_cafeteria_ref_code()));
CREATE POLICY "Manager manages category mode vis" ON public.category_mode_visibility
  FOR ALL USING (EXISTS (SELECT 1 FROM public.menu_categories c WHERE c.id = category_mode_visibility.category_id AND c.cafeteria_ref_code = public.get_my_manager_cafeteria_ref()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_categories c WHERE c.id = category_mode_visibility.category_id AND c.cafeteria_ref_code = public.get_my_manager_cafeteria_ref()));
CREATE POLICY "Staff views own cafe category mode vis" ON public.category_mode_visibility
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.menu_categories c WHERE c.id = category_mode_visibility.category_id AND c.cafeteria_ref_code = public.get_my_staff_cafeteria_ref()));
CREATE POLICY "Owner views all category mode vis" ON public.category_mode_visibility
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE TRIGGER trg_category_mode_visibility_updated_at
  BEFORE UPDATE ON public.category_mode_visibility
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


CREATE OR REPLACE FUNCTION public.copy_menu_to_mode(_mode public.order_mode)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rc text;
  copied int := 0;
BEGIN
  rc := public.get_my_cafeteria_ref_code();
  IF rc IS NULL THEN rc := public.get_my_manager_cafeteria_ref(); END IF;
  IF rc IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _mode = 'dine_in' THEN RAISE EXCEPTION 'Cannot copy into Dine In (base menu)'; END IF;

  INSERT INTO public.menu_mode_overrides (item_id, mode, name, description, image_url, price, is_visible)
  SELECT mi.id, _mode, mi.name, mi.description, mi.image_url, mi.price, mi.is_available
    FROM public.menu_items mi
   WHERE mi.cafeteria_ref_code = rc
   ON CONFLICT (item_id, mode) DO UPDATE
     SET name = EXCLUDED.name, description = EXCLUDED.description, image_url = EXCLUDED.image_url,
         price = EXCLUDED.price, is_visible = EXCLUDED.is_visible, updated_at = now();
  GET DIAGNOSTICS copied = ROW_COUNT;

  INSERT INTO public.category_mode_visibility (category_id, mode, is_visible)
  SELECT c.id, _mode, c.is_active
    FROM public.menu_categories c
   WHERE c.cafeteria_ref_code = rc
   ON CONFLICT (category_id, mode) DO UPDATE
     SET is_visible = EXCLUDED.is_visible, updated_at = now();

  RETURN copied;
END $$;


CREATE OR REPLACE FUNCTION public.get_menu_for_qr(_qr_token text, _mode public.order_mode DEFAULT 'dine_in'::public.order_mode)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tbl RECORD; cafe RECORD;
  active_tier_id uuid; active_tier_name text;
  sec_tier_id uuid;
  cats jsonb; items jsonb; popular jsonb; footer jsonb;
BEGIN
  SELECT id, cafeteria_ref_code, label, section_id
    INTO tbl FROM public.restaurant_tables
   WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url,
         mode_dine_in, mode_takeaway, mode_delivery, estimated_delivery_minutes,
         delivery_fee_a_name, delivery_fee_a_amount,
         delivery_fee_b_name, delivery_fee_b_amount,
         delivery_fee_c_name, delivery_fee_c_amount
    INTO cafe FROM public.cafeterias
   WHERE ref_code = tbl.cafeteria_ref_code AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF tbl.section_id IS NOT NULL THEN
    SELECT s.price_tier_id INTO sec_tier_id FROM public.table_sections s WHERE s.id = tbl.section_id;
  END IF;
  IF sec_tier_id IS NOT NULL THEN
    SELECT id, name INTO active_tier_id, active_tier_name FROM public.price_tiers WHERE id = sec_tier_id AND is_active = true;
  END IF;
  IF active_tier_id IS NULL THEN
    SELECT id, name INTO active_tier_id, active_tier_name FROM public.price_tiers
     WHERE cafeteria_ref_code = tbl.cafeteria_ref_code AND is_default = true AND is_active = true LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) ORDER BY c.sort_order, c.name), '[]'::jsonb)
    INTO cats
    FROM public.menu_categories c
    LEFT JOIN public.category_mode_visibility cmv ON cmv.category_id = c.id AND cmv.mode = _mode
   WHERE c.cafeteria_ref_code = tbl.cafeteria_ref_code AND c.is_active = true AND COALESCE(cmv.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(mo.name, i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, CASE WHEN _mode = 'dine_in' THEN mip.price ELSE NULL END, i.price),
           'image_url', COALESCE(mo.image_url, i.image_url),
           'is_most_popular', i.is_most_popular,
           'sort_order', i.sort_order
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items
    FROM public.menu_items i
    LEFT JOIN public.menu_item_prices mip ON mip.item_id = i.id AND mip.tier_id = active_tier_id
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = _mode
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true AND COALESCE(mo.is_visible, true) = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'category_id', i.category_id,
           'name', COALESCE(mo.name, i.name),
           'description', COALESCE(mo.description, i.description),
           'price', COALESCE(mo.price, CASE WHEN _mode = 'dine_in' THEN mip.price ELSE NULL END, i.price),
           'image_url', COALESCE(mo.image_url, i.image_url)
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO popular
    FROM public.menu_items i
    LEFT JOIN public.menu_item_prices mip ON mip.item_id = i.id AND mip.tier_id = active_tier_id
    LEFT JOIN public.menu_mode_overrides mo ON mo.item_id = i.id AND mo.mode = _mode
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true AND i.is_most_popular = true AND COALESCE(mo.is_visible, true) = true;

  SELECT jsonb_build_object('enabled', COALESCE(footer_banner_enabled, false), 'text', footer_banner_text, 'cta_text', footer_banner_cta_text, 'url', footer_banner_url)
    INTO footer FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object(
    'table', jsonb_build_object('id', tbl.id, 'label', tbl.label, 'cafeteria_ref_code', tbl.cafeteria_ref_code),
    'cafeteria', jsonb_build_object(
                   'ref_code', cafe.ref_code, 'name', cafe.name, 'currency_code', cafe.currency_code,
                   'menu_header_url', cafe.menu_header_url, 'menu_footer_url', cafe.menu_footer_url, 'banner_url', cafe.banner_url,
                   'mode_dine_in', cafe.mode_dine_in, 'mode_takeaway', cafe.mode_takeaway, 'mode_delivery', cafe.mode_delivery,
                   'estimated_delivery_minutes', cafe.estimated_delivery_minutes,
                   'delivery_fees', jsonb_build_array(
                     jsonb_build_object('key','a','name', cafe.delivery_fee_a_name, 'amount', cafe.delivery_fee_a_amount),
                     jsonb_build_object('key','b','name', cafe.delivery_fee_b_name, 'amount', cafe.delivery_fee_b_amount),
                     jsonb_build_object('key','c','name', cafe.delivery_fee_c_name, 'amount', cafe.delivery_fee_c_amount)
                   )
                 ),
    'mode', _mode,
    'active_tier', CASE WHEN active_tier_id IS NULL THEN NULL ELSE jsonb_build_object('id', active_tier_id, 'name', active_tier_name) END,
    'footer_banner', COALESCE(footer, jsonb_build_object('enabled', false)),
    'categories', cats, 'items', items, 'popular', popular
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.place_order(_qr_token text, _customer_name text, _notes text, _items jsonb, _mode public.order_mode DEFAULT 'dine_in'::public.order_mode)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tbl RECORD; it JSONB; mi RECORD; qty INT;
  grand NUMERIC(12,2) := 0; new_order_id UUID;
  matched_shift_id UUID; matched_user UUID;
  cafe_balance NUMERIC(14,2);
  trial_ok boolean; dup_id UUID; total_qty INT := 0;
  active_tier_id uuid; active_tier_name text;
  effective_price numeric(12,2); effective_name text;
  ovr RECORD; ovr_found boolean; sec RECORD;
BEGIN
  SELECT * INTO tbl FROM public.restaurant_tables WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive table'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  IF tbl.section_id IS NOT NULL THEN
    SELECT s.price_tier_id INTO sec FROM public.table_sections s WHERE s.id = tbl.section_id;
    active_tier_id := sec.price_tier_id;
  END IF;
  IF active_tier_id IS NULL THEN
    SELECT id INTO active_tier_id FROM public.price_tiers
     WHERE cafeteria_ref_code = tbl.cafeteria_ref_code AND is_default = true AND is_active = true LIMIT 1;
  END IF;
  IF active_tier_id IS NOT NULL THEN
    SELECT name INTO active_tier_name FROM public.price_tiers WHERE id = active_tier_id;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID AND cafeteria_ref_code = tbl.cafeteria_ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;

    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = _mode;
    ovr_found := FOUND;
    IF ovr_found AND ovr.is_visible = false THEN RAISE EXCEPTION 'Item not available'; END IF;

    effective_price := NULL;
    IF ovr_found AND ovr.price IS NOT NULL THEN
      effective_price := ovr.price;
    ELSIF _mode = 'dine_in' AND active_tier_id IS NOT NULL THEN
      SELECT price INTO effective_price FROM public.menu_item_prices WHERE item_id = mi.id AND tier_id = active_tier_id;
    END IF;
    IF effective_price IS NULL THEN effective_price := mi.price; END IF;

    grand := grand + (effective_price * qty);
    total_qty := total_qty + qty;
  END LOOP;

  IF grand <= 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  SELECT points_balance INTO cafe_balance FROM public.cafeterias WHERE ref_code = tbl.cafeteria_ref_code;
  trial_ok := public.cafeteria_trial_active(tbl.cafeteria_ref_code);

  IF NOT trial_ok AND (cafe_balance IS NULL OR cafe_balance <= 0) THEN
    RAISE EXCEPTION 'TRIAL_EXPIRED_NO_BALANCE: free trial ended and points balance is insufficient';
  END IF;
  IF NOT trial_ok THEN
    IF cafe_balance IS NULL OR cafe_balance < grand THEN
      RAISE EXCEPTION 'INSUFFICIENT_BALANCE: cafeteria balance is insufficient for this order';
    END IF;
  END IF;

  SELECT id INTO dup_id FROM public.orders
   WHERE table_id = tbl.id AND status <> 'cancelled' AND total = grand
     AND created_at > now() - INTERVAL '8 seconds'
   ORDER BY created_at DESC LIMIT 1;
  IF dup_id IS NOT NULL THEN RETURN dup_id; END IF;

  IF tbl.section_id IS NOT NULL THEN
    SELECT sh.id, sh.staff_user_id INTO matched_shift_id, matched_user
    FROM public.shifts sh
    JOIN public.staff st ON st.user_id = sh.staff_user_id AND st.cafeteria_ref_code = sh.cafeteria_ref_code
    WHERE sh.cafeteria_ref_code = tbl.cafeteria_ref_code
      AND sh.status = 'active' AND sh.staff_role = 'waiter'
      AND EXISTS (SELECT 1 FROM public.staff_scopes sc WHERE sc.staff_id = st.id AND sc.kind = 'section' AND sc.ref_id = tbl.section_id)
    ORDER BY sh.approved_at DESC NULLS LAST, sh.requested_at DESC LIMIT 1;

    IF matched_shift_id IS NULL THEN
      SELECT sh.id, sh.staff_user_id INTO matched_shift_id, matched_user
      FROM public.shifts sh
      JOIN public.staff st ON st.user_id = sh.staff_user_id AND st.cafeteria_ref_code = sh.cafeteria_ref_code
      WHERE sh.cafeteria_ref_code = tbl.cafeteria_ref_code
        AND sh.status = 'active' AND sh.staff_role = 'waiter'
        AND NOT EXISTS (SELECT 1 FROM public.staff_scopes sc WHERE sc.staff_id = st.id AND sc.kind = 'section')
      ORDER BY sh.approved_at DESC NULLS LAST, sh.requested_at DESC LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_id, table_label, customer_name, notes, total, status, shift_id, served_by, price_tier_id, price_tier_name, mode)
  VALUES (tbl.cafeteria_ref_code, tbl.id, tbl.label, NULLIF(_customer_name,''), NULLIF(_notes,''), grand, 'new', matched_shift_id, matched_user, active_tier_id, active_tier_name, _mode)
  RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID AND cafeteria_ref_code = tbl.cafeteria_ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;

    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = _mode;
    ovr_found := FOUND;
    IF ovr_found AND ovr.is_visible = false THEN RAISE EXCEPTION 'Item not available'; END IF;

    effective_price := NULL;
    effective_name := mi.name;
    IF ovr_found THEN
      IF ovr.price IS NOT NULL THEN effective_price := ovr.price; END IF;
      IF ovr.name IS NOT NULL THEN effective_name := ovr.name; END IF;
    END IF;
    IF effective_price IS NULL AND _mode = 'dine_in' AND active_tier_id IS NOT NULL THEN
      SELECT price INTO effective_price FROM public.menu_item_prices WHERE item_id = mi.id AND tier_id = active_tier_id;
    END IF;
    IF effective_price IS NULL THEN effective_price := mi.price; END IF;

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
    VALUES (new_order_id, mi.id, effective_name, effective_price, qty, NULLIF(it->>'notes',''));
  END LOOP;

  RETURN new_order_id;
END $function$;
