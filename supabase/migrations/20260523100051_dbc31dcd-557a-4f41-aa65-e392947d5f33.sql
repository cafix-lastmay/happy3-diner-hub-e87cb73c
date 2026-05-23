CREATE OR REPLACE FUNCTION public.sync_cafeteria_trial_from_custom_grace(_ref text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  latest_end timestamptz;
  default_days int;
  cafe_created timestamptz;
  new_end timestamptz;
BEGIN
  -- Latest (longest) custom grace period end for this cafeteria
  SELECT MAX((start_date::timestamptz) + (days || ' days')::interval)
    INTO latest_end
    FROM public.custom_grace_periods
   WHERE cafeteria_ref_code = _ref;

  IF latest_end IS NOT NULL THEN
    new_end := latest_end;
  ELSE
    -- No custom grace periods → fall back to default trial from cafeteria creation
    SELECT created_at INTO cafe_created FROM public.cafeterias WHERE ref_code = _ref;
    SELECT COALESCE(default_trial_days, 21) INTO default_days FROM public.app_settings LIMIT 1;
    IF cafe_created IS NULL THEN RETURN; END IF;
    new_end := cafe_created + (default_days || ' days')::interval;
  END IF;

  UPDATE public.cafeterias
     SET free_trial_until = new_end,
         trial_consumed = (new_end <= now()),
         updated_at = now()
   WHERE ref_code = _ref;
END;
$function$;

-- Backfill: re-sync every cafeteria so any stale free_trial_until is corrected
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT ref_code FROM public.cafeterias LOOP
    PERFORM public.sync_cafeteria_trial_from_custom_grace(r.ref_code);
  END LOOP;
END $$;