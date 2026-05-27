CREATE OR REPLACE FUNCTION public.approve_recharge_with_points(_recharge_id uuid, _points integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  current_marketer RECORD;
  rate RECORD;
  distance INT := 1;
  commission_amt NUMERIC(14,4);
  prev_frozen RECORD;
  cafe_created_at timestamptz;
  global_months INT;
  eligible_months INT;
  months_since NUMERIC;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only owner can approve recharges';
  END IF;

  IF _points IS NULL OR _points <= 0 THEN
    RAISE EXCEPTION 'Points must be a positive integer';
  END IF;

  SELECT * INTO r FROM public.recharge_requests WHERE id = _recharge_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Recharge not found or already processed'; END IF;

  UPDATE public.recharge_requests SET points_to_credit = _points WHERE id = _recharge_id;

  UPDATE public.cafeterias
  SET points_balance = points_balance + _points, updated_at = now()
  WHERE ref_code = r.cafeteria_ref_code;

  UPDATE public.recharge_requests
  SET status = 'approved', approved_by = auth.uid(), approved_at = now()
  WHERE id = _recharge_id;

  SELECT created_at INTO cafe_created_at FROM public.cafeterias WHERE ref_code = r.cafeteria_ref_code;
  SELECT COALESCE(commission_eligibility_months, 12) INTO global_months FROM public.app_settings LIMIT 1;
  months_since := EXTRACT(EPOCH FROM (now() - cafe_created_at)) / (60.0 * 60 * 24 * 30);

  SELECT m.* INTO current_marketer
  FROM public.cafeterias c
  JOIN public.marketers m ON m.ref_code = c.parent_ref_code
  WHERE c.ref_code = r.cafeteria_ref_code;

  WHILE current_marketer.ref_code IS NOT NULL AND distance <= 3 LOOP
    eligible_months := COALESCE(current_marketer.custom_commission_months, global_months);

    IF months_since <= eligible_months THEN
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
    END IF;

    IF current_marketer.parent_ref_code IS NULL THEN EXIT; END IF;
    SELECT * INTO current_marketer FROM public.marketers WHERE ref_code = current_marketer.parent_ref_code;
    distance := distance + 1;
  END LOOP;
END;
$function$;
