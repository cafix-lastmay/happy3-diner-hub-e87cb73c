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
  active_tier_name text;
  effective_price numeric(12,2);
  sec RECORD;
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
     WHERE cafeteria_ref_code = tbl.cafeteria_ref_code AND is_default = true AND is_active = true
     LIMIT 1;
  END IF;
  IF active_tier_id IS NOT NULL THEN
    SELECT name INTO active_tier_name FROM public.price_tiers WHERE id = active_tier_id;
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

  -- BALANCE CHECK ONLY (no deduction here; deduction happens on status='paid')
  -- Generic messages to avoid leaking the cafeteria's exact balance to anonymous callers.
  IF NOT trial_ok AND (cafe_balance IS NULL OR cafe_balance <= 0) THEN
    RAISE EXCEPTION 'TRIAL_EXPIRED_NO_BALANCE: free trial ended and points balance is insufficient';
  END IF;
  IF NOT trial_ok THEN
    IF cafe_balance IS NULL OR cafe_balance < grand THEN
      RAISE EXCEPTION 'INSUFFICIENT_BALANCE: cafeteria balance is insufficient for this order';
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

  INSERT INTO public.orders (cafeteria_ref_code, table_id, table_label, customer_name, notes, total, status, shift_id, served_by, price_tier_id, price_tier_name)
  VALUES (tbl.cafeteria_ref_code, tbl.id, tbl.label, NULLIF(_customer_name,''), NULLIF(_notes,''), grand, 'new', matched_shift_id, matched_user, active_tier_id, active_tier_name)
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