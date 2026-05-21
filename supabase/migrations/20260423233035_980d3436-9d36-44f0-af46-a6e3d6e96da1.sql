-- Price tiers per cafeteria, with section binding and per-item overrides

-- 1) price_tiers: per-cafeteria named price categories (e.g. عادي، VIP، توصيل)
CREATE TABLE public.price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code text NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_price_tiers_cafe ON public.price_tiers(cafeteria_ref_code);
CREATE UNIQUE INDEX uniq_price_tier_default_per_cafe
  ON public.price_tiers(cafeteria_ref_code) WHERE is_default = true;

ALTER TABLE public.price_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cafe manages own price tiers" ON public.price_tiers
  FOR ALL USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code())
  WITH CHECK (cafeteria_ref_code = public.get_my_cafeteria_ref_code());
CREATE POLICY "Manager manages price tiers" ON public.price_tiers
  FOR ALL USING (cafeteria_ref_code = public.get_my_manager_cafeteria_ref())
  WITH CHECK (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());
CREATE POLICY "Owner views all price tiers" ON public.price_tiers
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Staff views own cafe price tiers" ON public.price_tiers
  FOR SELECT USING (cafeteria_ref_code = public.get_my_staff_cafeteria_ref());
-- Public read is required so the customer (anon) menu RPC works through PostgREST contexts;
-- but get_menu_for_qr is SECURITY DEFINER so we don't need a public SELECT policy here.

CREATE TRIGGER trg_price_tiers_updated
BEFORE UPDATE ON public.price_tiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2) menu_item_prices: override price per (item, tier). If no row -> fallback to menu_items.price
CREATE TABLE public.menu_item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES public.price_tiers(id) ON DELETE CASCADE,
  price numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, tier_id)
);
CREATE INDEX idx_menu_item_prices_item ON public.menu_item_prices(item_id);
CREATE INDEX idx_menu_item_prices_tier ON public.menu_item_prices(tier_id);

ALTER TABLE public.menu_item_prices ENABLE ROW LEVEL SECURITY;

-- Manage rows whose item belongs to my cafeteria (admin or manager)
CREATE POLICY "Cafe manages own item prices" ON public.menu_item_prices
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_prices.item_id
      AND mi.cafeteria_ref_code = public.get_my_cafeteria_ref_code()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_prices.item_id
      AND mi.cafeteria_ref_code = public.get_my_cafeteria_ref_code()
  ));
CREATE POLICY "Manager manages item prices" ON public.menu_item_prices
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_prices.item_id
      AND mi.cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_prices.item_id
      AND mi.cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
  ));
CREATE POLICY "Owner views all item prices" ON public.menu_item_prices
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "Staff views own cafe item prices" ON public.menu_item_prices
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_prices.item_id
      AND mi.cafeteria_ref_code = public.get_my_staff_cafeteria_ref()
  ));

CREATE TRIGGER trg_menu_item_prices_updated
BEFORE UPDATE ON public.menu_item_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3) Bind table sections to a price tier (nullable -> use default tier)
ALTER TABLE public.table_sections
  ADD COLUMN price_tier_id uuid REFERENCES public.price_tiers(id) ON DELETE SET NULL;

-- 4) Update get_menu_for_qr: resolve tier from table.section -> price_tier_id (or default),
--    apply override price per item, and surface the active tier to the client.
CREATE OR REPLACE FUNCTION public.get_menu_for_qr(_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tbl RECORD;
  cafe RECORD;
  sec RECORD;
  active_tier RECORD;
  cats jsonb;
  items jsonb;
  popular jsonb;
  footer jsonb;
BEGIN
  SELECT id, cafeteria_ref_code, label, section_id
    INTO tbl
    FROM public.restaurant_tables
   WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url, banner_url
    INTO cafe
    FROM public.cafeterias
   WHERE ref_code = tbl.cafeteria_ref_code AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Resolve active tier: section binding > cafeteria default > NULL (use base price)
  IF tbl.section_id IS NOT NULL THEN
    SELECT s.price_tier_id INTO sec FROM public.table_sections s WHERE s.id = tbl.section_id;
  END IF;

  IF sec.price_tier_id IS NOT NULL THEN
    SELECT id, name, is_default INTO active_tier
      FROM public.price_tiers
     WHERE id = sec.price_tier_id AND is_active = true;
  END IF;
  IF active_tier.id IS NULL THEN
    SELECT id, name, is_default INTO active_tier
      FROM public.price_tiers
     WHERE cafeteria_ref_code = tbl.cafeteria_ref_code AND is_default = true AND is_active = true
     LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'sort_order', c.sort_order
         ) ORDER BY c.sort_order, c.name), '[]'::jsonb)
    INTO cats
    FROM public.menu_categories c
   WHERE c.cafeteria_ref_code = tbl.cafeteria_ref_code AND c.is_active = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'category_id', i.category_id,
           'name', i.name,
           'description', i.description,
           'price', COALESCE(mip.price, i.price),
           'image_url', i.image_url,
           'is_most_popular', i.is_most_popular,
           'sort_order', i.sort_order
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO items
    FROM public.menu_items i
    LEFT JOIN public.menu_item_prices mip
      ON mip.item_id = i.id AND mip.tier_id = active_tier.id
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'category_id', i.category_id,
           'name', i.name,
           'description', i.description,
           'price', COALESCE(mip.price, i.price),
           'image_url', i.image_url
         ) ORDER BY i.sort_order, i.name), '[]'::jsonb)
    INTO popular
    FROM public.menu_items i
    LEFT JOIN public.menu_item_prices mip
      ON mip.item_id = i.id AND mip.tier_id = active_tier.id
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code
     AND i.is_available = true
     AND i.is_most_popular = true;

  SELECT jsonb_build_object(
           'enabled', COALESCE(footer_banner_enabled, false),
           'text', footer_banner_text,
           'cta_text', footer_banner_cta_text,
           'url', footer_banner_url
         )
    INTO footer
    FROM public.app_settings WHERE id = true;

  RETURN jsonb_build_object(
    'table',      jsonb_build_object('id', tbl.id, 'label', tbl.label, 'cafeteria_ref_code', tbl.cafeteria_ref_code),
    'cafeteria',  jsonb_build_object(
                    'ref_code', cafe.ref_code,
                    'name', cafe.name,
                    'currency_code', cafe.currency_code,
                    'menu_header_url', cafe.menu_header_url,
                    'menu_footer_url', cafe.menu_footer_url,
                    'banner_url', cafe.banner_url
                  ),
    'active_tier', CASE WHEN active_tier.id IS NULL THEN NULL
                        ELSE jsonb_build_object('id', active_tier.id, 'name', active_tier.name)
                   END,
    'footer_banner', COALESCE(footer, jsonb_build_object('enabled', false)),
    'categories', cats,
    'items',      items,
    'popular',    popular
  );
END;
$function$;

-- 5) Update place_order to charge using the tier price tied to the table's section
CREATE OR REPLACE FUNCTION public.place_order(_qr_token text, _customer_name text, _notes text, _items jsonb)
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
  trial_ok boolean;
  dup_id UUID;
  total_qty INT := 0;
  active_tier_id uuid;
  effective_price numeric(12,2);
  sec RECORD;
BEGIN
  SELECT * INTO tbl FROM public.restaurant_tables WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive table'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  -- Resolve active tier (section binding > cafeteria default)
  IF tbl.section_id IS NOT NULL THEN
    SELECT s.price_tier_id INTO sec FROM public.table_sections s WHERE s.id = tbl.section_id;
    active_tier_id := sec.price_tier_id;
  END IF;
  IF active_tier_id IS NULL THEN
    SELECT id INTO active_tier_id FROM public.price_tiers
     WHERE cafeteria_ref_code = tbl.cafeteria_ref_code AND is_default = true AND is_active = true
     LIMIT 1;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID
        AND cafeteria_ref_code = tbl.cafeteria_ref_code
        AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;

    effective_price := mi.price;
    IF active_tier_id IS NOT NULL THEN
      SELECT price INTO effective_price FROM public.menu_item_prices
       WHERE item_id = mi.id AND tier_id = active_tier_id;
      IF effective_price IS NULL THEN effective_price := mi.price; END IF;
    END IF;

    grand := grand + (effective_price * qty);
    total_qty := total_qty + qty;
  END LOOP;

  IF grand <= 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  SELECT points_balance INTO cafe_balance FROM public.cafeterias WHERE ref_code = tbl.cafeteria_ref_code;
  trial_ok := public.cafeteria_trial_active(tbl.cafeteria_ref_code);

  IF NOT trial_ok AND (cafe_balance IS NULL OR cafe_balance <= 0) THEN
    RAISE EXCEPTION 'TRIAL_EXPIRED_NO_BALANCE: free trial ended and points balance is zero';
  END IF;
  IF NOT trial_ok THEN
    IF cafe_balance IS NULL OR cafe_balance < grand THEN
      RAISE EXCEPTION 'INSUFFICIENT_BALANCE: cafeteria points balance (%) is less than order total (%)', COALESCE(cafe_balance,0), grand;
    END IF;
  END IF;

  SELECT id INTO dup_id FROM public.orders
   WHERE table_id = tbl.id
     AND status <> 'cancelled'
     AND total = grand
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

  IF NOT trial_ok THEN
    UPDATE public.cafeterias
       SET points_balance = points_balance - grand, updated_at = now()
     WHERE ref_code = tbl.cafeteria_ref_code AND points_balance >= grand;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_BALANCE: balance changed during order';
    END IF;
  END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_id, table_label, customer_name, notes, total, status, shift_id, served_by)
  VALUES (tbl.cafeteria_ref_code, tbl.id, tbl.label, NULLIF(_customer_name,''), NULLIF(_notes,''), grand, 'new', matched_shift_id, matched_user)
  RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID AND cafeteria_ref_code = tbl.cafeteria_ref_code AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;

    effective_price := mi.price;
    IF active_tier_id IS NOT NULL THEN
      SELECT price INTO effective_price FROM public.menu_item_prices
       WHERE item_id = mi.id AND tier_id = active_tier_id;
      IF effective_price IS NULL THEN effective_price := mi.price; END IF;
    END IF;

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
    VALUES (new_order_id, mi.id, mi.name, effective_price, qty, NULLIF(it->>'notes',''));
  END LOOP;

  RETURN new_order_id;
END $function$;

-- 6) Helper RPC: ensure exactly one default tier per cafeteria when toggling
CREATE OR REPLACE FUNCTION public.set_default_price_tier(_tier_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cafe text;
BEGIN
  SELECT cafeteria_ref_code INTO cafe FROM public.price_tiers WHERE id = _tier_id;
  IF cafe IS NULL THEN RAISE EXCEPTION 'Tier not found'; END IF;
  IF NOT public.is_cafe_admin_or_manager(cafe) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.price_tiers SET is_default = false WHERE cafeteria_ref_code = cafe AND id <> _tier_id;
  UPDATE public.price_tiers SET is_default = true WHERE id = _tier_id;
END $function$;