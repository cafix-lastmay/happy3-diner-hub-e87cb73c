
-- 1. Add grace columns
ALTER TABLE public.cafeterias
  ADD COLUMN IF NOT EXISTS grace_period_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_active boolean NOT NULL DEFAULT false;

-- 2. Lock the new fields against direct cafe-admin edits
CREATE OR REPLACE FUNCTION public.protect_cafeteria_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'owner') THEN
    RETURN NEW;
  END IF;
  NEW.points_balance := OLD.points_balance;
  NEW.free_trial_until := OLD.free_trial_until;
  NEW.trial_consumed := OLD.trial_consumed;
  NEW.trial_start := OLD.trial_start;
  NEW.is_active := OLD.is_active;
  NEW.signup_type := OLD.signup_type;
  NEW.ref_code := OLD.ref_code;
  NEW.parent_ref_code := OLD.parent_ref_code;
  NEW.user_id := OLD.user_id;
  NEW.grace_period_started_at := OLD.grace_period_started_at;
  NEW.grace_period_active := OLD.grace_period_active;
  RETURN NEW;
END $function$;

-- 3. Helper: is the cafeteria blocked (grace expired)?
CREATE OR REPLACE FUNCTION public.cafeteria_is_blocked(_ref text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    grace_period_active
    AND grace_period_started_at IS NOT NULL
    AND grace_period_started_at + interval '72 hours' <= now(),
    false
  )
  FROM public.cafeterias WHERE ref_code = _ref;
$$;

-- 4. Replace the order-paid trigger:
--    - During trial: no-op (unchanged)
--    - Allow deduction even if balance goes negative (grace period must keep things working)
--    - After deduction, if points <= 0 and grace not active yet → start grace + notify
CREATE OR REPLACE FUNCTION public.handle_order_points_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  trial_ok boolean;
  cafe RECORD;
  cafe_user uuid;
  owner_user uuid;
BEGIN
  IF (TG_OP = 'UPDATE') AND NEW.status = 'paid' AND OLD.status <> 'paid' THEN
    trial_ok := public.cafeteria_trial_active(NEW.cafeteria_ref_code);
    IF NOT trial_ok THEN
      -- Deduct unconditionally (allow negative balance during grace).
      UPDATE public.cafeterias
         SET points_balance = points_balance - NEW.total, updated_at = now()
       WHERE ref_code = NEW.cafeteria_ref_code
       RETURNING * INTO cafe;

      -- Start grace if balance just reached <= 0 and grace not already running.
      IF cafe.points_balance <= 0 AND cafe.grace_period_active = false THEN
        UPDATE public.cafeterias
           SET grace_period_active = true,
               grace_period_started_at = now()
         WHERE ref_code = NEW.cafeteria_ref_code;

        cafe_user := cafe.user_id;
        IF cafe_user IS NOT NULL THEN
          PERFORM public.create_notification(
            cafe_user, 'cafeteria.grace_started',
            'رصيد النقاط نفد',
            'لديك 72 ساعة لشحن الرصيد قبل إيقاف الكافيتريا.',
            jsonb_build_object('route','/cafeteria/recharge','ref_code', NEW.cafeteria_ref_code));
        END IF;
        FOR owner_user IN SELECT user_id FROM public.user_roles WHERE role = 'owner' LOOP
          PERFORM public.create_notification(
            owner_user, 'cafeteria.grace_started',
            'كافيتريا دخلت فترة السماح',
            'الكافيتريا ' || NEW.cafeteria_ref_code || ' نفد رصيدها — 72 ساعة متبقية.',
            jsonb_build_object('route','/owner/cafeterias','ref_code', NEW.cafeteria_ref_code));
        END LOOP;
      END IF;
    END IF;
  END IF;

  IF (TG_OP = 'UPDATE') AND OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    trial_ok := public.cafeteria_trial_active(NEW.cafeteria_ref_code);
    IF NOT trial_ok THEN
      UPDATE public.cafeterias
         SET points_balance = points_balance + OLD.total, updated_at = now()
       WHERE ref_code = NEW.cafeteria_ref_code;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

-- 5. Block place_order when cafeteria is blocked (grace expired)
CREATE OR REPLACE FUNCTION public.place_order(
  _qr_token text, _customer_name text, _notes text, _items jsonb,
  _mode order_mode DEFAULT 'dine_in'::order_mode
)
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

  -- NEW: reject orders when cafeteria is blocked (grace period expired)
  IF public.cafeteria_is_blocked(tbl.cafeteria_ref_code) THEN
    RAISE EXCEPTION 'CAFETERIA_BLOCKED: cafeteria is suspended — recharge required';
  END IF;

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

    effective_name := COALESCE(NULLIF(ovr.name,''), mi.name);

    grand := grand + (effective_price * qty);
    total_qty := total_qty + qty;
  END LOOP;
  IF total_qty = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  -- find active shift for waiter to attach
  SELECT s.id, s.staff_user_id INTO matched_shift_id, matched_user
    FROM public.shifts s
   WHERE s.cafeteria_ref_code = tbl.cafeteria_ref_code AND s.status = 'active' AND s.staff_role = 'waiter'
   ORDER BY s.approved_at DESC LIMIT 1;

  INSERT INTO public.orders
    (cafeteria_ref_code, table_id, table_label, customer_name, notes, total, status, mode,
     shift_id, served_by, price_tier_id, price_tier_name)
  VALUES
    (tbl.cafeteria_ref_code, tbl.id, tbl.label, NULLIF(_customer_name,''), NULLIF(_notes,''),
     grand, 'new', _mode, matched_shift_id, matched_user, active_tier_id, active_tier_name)
  RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items WHERE id = (it->>'item_id')::UUID;

    SELECT * INTO ovr FROM public.menu_mode_overrides WHERE item_id = mi.id AND mode = _mode;
    ovr_found := FOUND;

    effective_price := NULL;
    IF ovr_found AND ovr.price IS NOT NULL THEN
      effective_price := ovr.price;
    ELSIF _mode = 'dine_in' AND active_tier_id IS NOT NULL THEN
      SELECT price INTO effective_price FROM public.menu_item_prices WHERE item_id = mi.id AND tier_id = active_tier_id;
    END IF;
    IF effective_price IS NULL THEN effective_price := mi.price; END IF;
    effective_name := COALESCE(NULLIF(ovr.name,''), mi.name);

    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
    VALUES (new_order_id, mi.id, effective_name, effective_price, qty, NULLIF(it->>'notes',''));
  END LOOP;

  RETURN new_order_id;
END $function$;

-- 6. Clear grace when a recharge is approved and balance becomes positive
CREATE OR REPLACE FUNCTION public.clear_grace_on_positive_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.points_balance > 0 AND OLD.grace_period_active = true THEN
    NEW.grace_period_active := false;
    NEW.grace_period_started_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clear_grace_on_positive ON public.cafeterias;
CREATE TRIGGER trg_clear_grace_on_positive
  BEFORE UPDATE OF points_balance ON public.cafeterias
  FOR EACH ROW EXECUTE FUNCTION public.clear_grace_on_positive_balance();

-- 7. Owner overview helper: list cafeterias currently in grace or blocked
CREATE OR REPLACE FUNCTION public.owner_grace_cafeterias()
RETURNS TABLE(
  ref_code text, name text, points_balance numeric,
  grace_started_at timestamptz, seconds_remaining bigint, is_blocked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.ref_code, c.name, c.points_balance,
    c.grace_period_started_at,
    GREATEST(0, EXTRACT(EPOCH FROM (c.grace_period_started_at + interval '72 hours' - now())))::bigint AS seconds_remaining,
    (c.grace_period_started_at + interval '72 hours' <= now()) AS is_blocked
  FROM public.cafeterias c
  WHERE c.grace_period_active = true
    AND public.has_role(auth.uid(), 'owner')
  ORDER BY c.grace_period_started_at ASC;
$$;
