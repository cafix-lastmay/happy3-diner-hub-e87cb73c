-- 1. App settings table (singleton row, owner-managed)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true,
  default_trial_days integer NOT NULL DEFAULT 21,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT app_settings_singleton CHECK (id = true)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Owner manages app settings" ON public.app_settings FOR ALL
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

INSERT INTO public.app_settings(id, default_trial_days) VALUES (true, 21)
ON CONFLICT (id) DO NOTHING;

-- 2. Trial tracking columns on cafeterias (free_trial_until already exists = trial_end)
ALTER TABLE public.cafeterias
  ADD COLUMN IF NOT EXISTS trial_start timestamptz,
  ADD COLUMN IF NOT EXISTS trial_consumed boolean NOT NULL DEFAULT false;

-- 3. Backfill trial_start for existing cafeterias that already have free_trial_until
UPDATE public.cafeterias
   SET trial_start = COALESCE(trial_start, created_at),
       trial_consumed = (free_trial_until IS NOT NULL AND free_trial_until <= now())
 WHERE trial_start IS NULL;

-- 4. Trigger: auto-start trial on cafeteria insert using app_settings.default_trial_days
CREATE OR REPLACE FUNCTION public.set_cafeteria_trial_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d integer;
BEGIN
  IF NEW.trial_start IS NULL THEN
    SELECT default_trial_days INTO d FROM public.app_settings WHERE id = true;
    d := COALESCE(d, 21);
    NEW.trial_start := now();
    IF NEW.free_trial_until IS NULL AND d > 0 THEN
      NEW.free_trial_until := now() + (d || ' days')::interval;
    END IF;
    NEW.trial_consumed := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_cafeteria_trial ON public.cafeterias;
CREATE TRIGGER trg_set_cafeteria_trial BEFORE INSERT ON public.cafeterias
FOR EACH ROW EXECUTE FUNCTION public.set_cafeteria_trial_on_insert();

-- 5. Helper: trial active?
CREATE OR REPLACE FUNCTION public.cafeteria_trial_active(_ref_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT free_trial_until IS NOT NULL AND free_trial_until > now() AND trial_consumed = false
     FROM public.cafeterias WHERE ref_code = _ref_code),
    false);
$$;

-- 6. Owner RPCs
CREATE OR REPLACE FUNCTION public.owner_set_default_trial_days(_days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Only owner'; END IF;
  IF _days IS NULL OR _days < 0 THEN RAISE EXCEPTION 'Invalid days'; END IF;
  UPDATE public.app_settings SET default_trial_days = _days, updated_at = now(), updated_by = auth.uid() WHERE id = true;
END $$;

CREATE OR REPLACE FUNCTION public.owner_set_cafeteria_trial(_ref_code text, _trial_end timestamptz, _consumed boolean DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Only owner'; END IF;
  UPDATE public.cafeterias
     SET free_trial_until = _trial_end,
         trial_consumed = COALESCE(_consumed, trial_consumed),
         updated_at = now()
   WHERE ref_code = _ref_code;
END $$;

-- 7. Update place_order: block when trial expired AND points = 0
CREATE OR REPLACE FUNCTION public.place_order(_qr_token text, _customer_name text, _notes text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tbl RECORD; it JSONB; mi RECORD; qty INT;
  item_total NUMERIC(12,2); grand NUMERIC(12,2) := 0; new_order_id UUID;
  matched_shift_id UUID; matched_user UUID;
  cafe_balance NUMERIC(14,2);
  trial_ok boolean;
  dup_id UUID;
  total_qty INT := 0;
BEGIN
  SELECT * INTO tbl FROM public.restaurant_tables WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive table'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID
        AND cafeteria_ref_code = tbl.cafeteria_ref_code
        AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;
    grand := grand + (mi.price * qty);
    total_qty := total_qty + qty;
  END LOOP;

  IF grand <= 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  SELECT points_balance INTO cafe_balance FROM public.cafeterias WHERE ref_code = tbl.cafeteria_ref_code;
  trial_ok := public.cafeteria_trial_active(tbl.cafeteria_ref_code);

  -- Trial expired AND no balance => hard block
  IF NOT trial_ok AND (cafe_balance IS NULL OR cafe_balance <= 0) THEN
    RAISE EXCEPTION 'TRIAL_EXPIRED_NO_BALANCE: free trial ended and points balance is zero';
  END IF;

  -- If not on trial, balance must cover order
  IF NOT trial_ok THEN
    IF cafe_balance IS NULL OR cafe_balance < grand THEN
      RAISE EXCEPTION 'INSUFFICIENT_BALANCE: cafeteria points balance (%) is less than order total (%)', COALESCE(cafe_balance,0), grand;
    END IF;
  END IF;

  -- IDEMPOTENCY
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

  -- Deduct only if not on trial
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
    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
    VALUES (new_order_id, mi.id, mi.name, mi.price, qty, NULLIF(it->>'notes',''));
  END LOOP;

  RETURN new_order_id;
END $function$;