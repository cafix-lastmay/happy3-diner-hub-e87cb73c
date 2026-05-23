
-- Function: recompute a cafeteria's free_trial_until from its custom grace periods.
-- If any custom grace periods exist, use MAX(start_date + days) as the trial end.
-- If none, keep whatever free_trial_until is currently there (no-op).
CREATE OR REPLACE FUNCTION public.sync_cafeteria_trial_from_custom_grace(_ref text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_end timestamptz;
BEGIN
  SELECT MAX((start_date::timestamptz) + (days || ' days')::interval)
    INTO latest_end
    FROM public.custom_grace_periods
   WHERE cafeteria_ref_code = _ref;

  IF latest_end IS NOT NULL THEN
    UPDATE public.cafeterias
       SET free_trial_until = latest_end,
           trial_consumed = (latest_end <= now()),
           updated_at = now()
     WHERE ref_code = _ref;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_custom_grace_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_cafeteria_trial_from_custom_grace(OLD.cafeteria_ref_code);
    RETURN OLD;
  ELSE
    PERFORM public.sync_cafeteria_trial_from_custom_grace(NEW.cafeteria_ref_code);
    IF TG_OP = 'UPDATE' AND OLD.cafeteria_ref_code <> NEW.cafeteria_ref_code THEN
      PERFORM public.sync_cafeteria_trial_from_custom_grace(OLD.cafeteria_ref_code);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_custom_grace_sync ON public.custom_grace_periods;
CREATE TRIGGER trg_custom_grace_sync
AFTER INSERT OR UPDATE OR DELETE ON public.custom_grace_periods
FOR EACH ROW EXECUTE FUNCTION public.tg_custom_grace_sync();

-- Backfill existing cafeterias from their custom grace periods.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT cafeteria_ref_code FROM public.custom_grace_periods LOOP
    PERFORM public.sync_cafeteria_trial_from_custom_grace(r.cafeteria_ref_code);
  END LOOP;
END $$;
