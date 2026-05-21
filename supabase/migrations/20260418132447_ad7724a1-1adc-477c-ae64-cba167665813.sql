-- New approve function that lets owner override points credited.
-- Keeps existing approve_recharge for backward compat, but routes through the new one.
CREATE OR REPLACE FUNCTION public.approve_recharge_with_points(_recharge_id uuid, _points integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  current_marketer RECORD;
  rate RECORD;
  distance INT := 1;
  commission_amt NUMERIC(14,4);
  prev_frozen RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only owner can approve recharges';
  END IF;

  IF _points IS NULL OR _points <= 0 THEN
    RAISE EXCEPTION 'Points must be a positive integer';
  END IF;

  SELECT * INTO r FROM public.recharge_requests WHERE id = _recharge_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Recharge not found or already processed'; END IF;

  -- 1. Update points_to_credit on the request to reflect owner decision
  UPDATE public.recharge_requests
  SET points_to_credit = _points
  WHERE id = _recharge_id;

  -- 2. Credit cafeteria points using owner-provided amount
  UPDATE public.cafeterias
  SET points_balance = points_balance + _points, updated_at = now()
  WHERE ref_code = r.cafeteria_ref_code;

  -- 3. Mark recharge approved
  UPDATE public.recharge_requests
  SET status = 'approved', approved_by = auth.uid(), approved_at = now()
  WHERE id = _recharge_id;

  -- 4. Walk marketer chain upward and create commissions (based on USD amount, unchanged)
  SELECT m.* INTO current_marketer
  FROM public.cafeterias c
  JOIN public.marketers m ON m.ref_code = c.parent_ref_code
  WHERE c.ref_code = r.cafeteria_ref_code;

  WHILE current_marketer.ref_code IS NOT NULL AND distance <= 3 LOOP
    SELECT * INTO rate FROM public.commission_rates WHERE level_distance = distance;
    IF FOUND AND rate.percentage > 0 THEN
      commission_amt := round(r.amount_usd * rate.percentage / 100, 4);

      INSERT INTO public.commission_transactions
        (recharge_id, marketer_ref_code, source_cafeteria_ref_code, level_distance, percentage, amount_usd, status)
      VALUES
        (_recharge_id, current_marketer.ref_code, r.cafeteria_ref_code, distance, rate.percentage, commission_amt, 'frozen');

      UPDATE public.marketers
      SET commission_balance_frozen = commission_balance_frozen + commission_amt, updated_at = now()
      WHERE ref_code = current_marketer.ref_code;

      -- Release older frozen commission (keep latest frozen)
      FOR prev_frozen IN
        SELECT id, amount_usd FROM public.commission_transactions
        WHERE marketer_ref_code = current_marketer.ref_code AND status = 'frozen'
        ORDER BY created_at DESC
        OFFSET 1
      LOOP
        UPDATE public.commission_transactions
        SET status = 'available', released_at = now()
        WHERE id = prev_frozen.id;

        UPDATE public.marketers
        SET commission_balance_frozen = commission_balance_frozen - prev_frozen.amount_usd,
            commission_balance_available = commission_balance_available + prev_frozen.amount_usd,
            updated_at = now()
        WHERE ref_code = current_marketer.ref_code;
      END LOOP;
    END IF;

    IF current_marketer.parent_ref_code IS NULL THEN EXIT; END IF;
    SELECT * INTO current_marketer FROM public.marketers WHERE ref_code = current_marketer.parent_ref_code;
    distance := distance + 1;
  END LOOP;
END;
$$;