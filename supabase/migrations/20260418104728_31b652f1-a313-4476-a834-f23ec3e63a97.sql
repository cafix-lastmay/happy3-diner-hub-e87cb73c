
-- Harden place_order: balance validation + idempotency dedup against double-clicks
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
  dup_id UUID;
  total_qty INT := 0;
BEGIN
  SELECT * INTO tbl FROM public.restaurant_tables WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive table'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  -- Pre-compute total + total_qty for balance check and dedup signature
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

  -- BALANCE VALIDATION: cafeteria must have enough points
  SELECT points_balance INTO cafe_balance FROM public.cafeterias WHERE ref_code = tbl.cafeteria_ref_code;
  IF cafe_balance IS NULL OR cafe_balance < grand THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: cafeteria points balance (%) is less than order total (%)', COALESCE(cafe_balance,0), grand;
  END IF;

  -- IDEMPOTENCY: if same table just submitted same total within last 8 seconds, return that order id
  SELECT id INTO dup_id FROM public.orders
   WHERE table_id = tbl.id
     AND status <> 'cancelled'
     AND total = grand
     AND created_at > now() - INTERVAL '8 seconds'
   ORDER BY created_at DESC LIMIT 1;
  IF dup_id IS NOT NULL THEN
    RETURN dup_id;
  END IF;

  -- Find an active waiter shift whose scope includes this table's section.
  IF tbl.section_id IS NOT NULL THEN
    SELECT sh.id, sh.staff_user_id INTO matched_shift_id, matched_user
    FROM public.shifts sh
    JOIN public.staff st ON st.user_id = sh.staff_user_id AND st.cafeteria_ref_code = sh.cafeteria_ref_code
    WHERE sh.cafeteria_ref_code = tbl.cafeteria_ref_code
      AND sh.status = 'active'
      AND sh.staff_role = 'waiter'
      AND EXISTS (
        SELECT 1 FROM public.staff_scopes sc
        WHERE sc.staff_id = st.id AND sc.kind = 'section' AND sc.ref_id = tbl.section_id
      )
    ORDER BY sh.approved_at DESC NULLS LAST, sh.requested_at DESC
    LIMIT 1;

    IF matched_shift_id IS NULL THEN
      SELECT sh.id, sh.staff_user_id INTO matched_shift_id, matched_user
      FROM public.shifts sh
      JOIN public.staff st ON st.user_id = sh.staff_user_id AND st.cafeteria_ref_code = sh.cafeteria_ref_code
      WHERE sh.cafeteria_ref_code = tbl.cafeteria_ref_code
        AND sh.status = 'active'
        AND sh.staff_role = 'waiter'
        AND NOT EXISTS (
          SELECT 1 FROM public.staff_scopes sc WHERE sc.staff_id = st.id AND sc.kind = 'section'
        )
      ORDER BY sh.approved_at DESC NULLS LAST, sh.requested_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- Deduct cafeteria points atomically
  UPDATE public.cafeterias
     SET points_balance = points_balance - grand, updated_at = now()
   WHERE ref_code = tbl.cafeteria_ref_code AND points_balance >= grand;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: balance changed during order';
  END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_id, table_label, customer_name, notes, total, status, shift_id, served_by)
  VALUES (tbl.cafeteria_ref_code, tbl.id, tbl.label, NULLIF(_customer_name,''), NULLIF(_notes,''), grand, 'new', matched_shift_id, matched_user)
  RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID
        AND cafeteria_ref_code = tbl.cafeteria_ref_code
        AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;
    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
    VALUES (new_order_id, mi.id, mi.name, mi.price, qty, NULLIF(it->>'notes',''));
  END LOOP;

  RETURN new_order_id;
END $function$;
