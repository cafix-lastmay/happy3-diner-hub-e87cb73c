
-- 1) Grants table
CREATE TABLE public.cafeteria_free_points_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_id uuid NOT NULL REFERENCES public.cafeterias(id) ON DELETE CASCADE,
  monthly_points integer NOT NULL CHECK (monthly_points > 0),
  duration_months integer NOT NULL CHECK (duration_months > 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cfpg_cafeteria ON public.cafeteria_free_points_grants(cafeteria_id);
CREATE INDEX idx_cfpg_active ON public.cafeteria_free_points_grants(is_active, start_date, end_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafeteria_free_points_grants TO authenticated;
GRANT ALL ON public.cafeteria_free_points_grants TO service_role;
ALTER TABLE public.cafeteria_free_points_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages free points grants"
  ON public.cafeteria_free_points_grants FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

-- 2) Balance table
CREATE TABLE public.cafeteria_free_points_balance (
  cafeteria_id uuid PRIMARY KEY REFERENCES public.cafeterias(id) ON DELETE CASCADE,
  free_points integer NOT NULL DEFAULT 0 CHECK (free_points >= 0),
  last_grant_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cafeteria_free_points_balance TO authenticated;
GRANT ALL ON public.cafeteria_free_points_balance TO service_role;
ALTER TABLE public.cafeteria_free_points_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner sees all free balances"
  ON public.cafeteria_free_points_balance FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Cafeteria reads its own free balance"
  ON public.cafeteria_free_points_balance FOR SELECT
  TO authenticated
  USING (
    cafeteria_id IN (SELECT id FROM public.cafeterias WHERE user_id = auth.uid())
  );

-- 3) Owner note on cafeterias
ALTER TABLE public.cafeterias ADD COLUMN IF NOT EXISTS owner_note text;

-- 4) updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_cfpg_updated BEFORE UPDATE ON public.cafeteria_free_points_grants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_cfpb_updated BEFORE UPDATE ON public.cafeteria_free_points_balance
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) Updated trigger: consume free first, then paid
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
  old_settled boolean;
  new_settled boolean;
  grace_days integer;
  grace_hours integer;
  v_cap integer;
  v_scope text;
  v_cafe_id uuid;
  v_used integer;
  v_today date;
  v_needed integer;
  v_free_avail integer;
  v_free_used integer;
  v_paid_used numeric;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  old_settled := OLD.status IN ('paid'::order_status, 'paid_at_counter'::order_status, 'served'::order_status);
  new_settled := NEW.status IN ('paid'::order_status, 'paid_at_counter'::order_status, 'served'::order_status);

  IF new_settled AND NOT old_settled THEN
    trial_ok := public.cafeteria_trial_active(NEW.cafeteria_ref_code);
    IF NOT trial_ok THEN
      SELECT cap, scope INTO v_cap, v_scope FROM public.get_effective_daily_cap(NEW.cafeteria_ref_code);
      SELECT id INTO v_cafe_id FROM public.cafeterias WHERE ref_code = NEW.cafeteria_ref_code;
      v_today := (now() AT TIME ZONE 'UTC')::date;
      v_needed := CEIL(COALESCE(NEW.total, 0))::integer;

      IF v_cap IS NOT NULL AND v_cafe_id IS NOT NULL THEN
        SELECT COALESCE(points_consumed, 0) INTO v_used
          FROM public.cafeteria_daily_points_usage
          WHERE cafeteria_id = v_cafe_id AND usage_date = v_today;
        v_used := COALESCE(v_used, 0);
        IF v_used + v_needed > v_cap THEN
          RAISE NOTICE 'points_skipped daily_cap_reached ref=% used=% needed=% cap=%',
            NEW.cafeteria_ref_code, v_used, v_needed, v_cap;
          RETURN NEW;
        END IF;
      END IF;

      -- Free-first consumption
      v_free_used := 0;
      v_paid_used := 0;
      IF v_cafe_id IS NOT NULL THEN
        SELECT COALESCE(free_points, 0) INTO v_free_avail
          FROM public.cafeteria_free_points_balance WHERE cafeteria_id = v_cafe_id;
        v_free_avail := COALESCE(v_free_avail, 0);
        IF v_free_avail > 0 THEN
          v_free_used := LEAST(v_free_avail, v_needed);
          UPDATE public.cafeteria_free_points_balance
             SET free_points = free_points - v_free_used, updated_at = now()
           WHERE cafeteria_id = v_cafe_id;
        END IF;
      END IF;
      v_paid_used := GREATEST(NEW.total - v_free_used, 0);

      IF v_paid_used > 0 THEN
        UPDATE public.cafeterias
           SET points_balance = points_balance - v_paid_used, updated_at = now()
         WHERE ref_code = NEW.cafeteria_ref_code
         RETURNING * INTO cafe;
      ELSE
        SELECT * INTO cafe FROM public.cafeterias WHERE ref_code = NEW.cafeteria_ref_code;
      END IF;

      IF v_cafe_id IS NOT NULL THEN
        INSERT INTO public.cafeteria_daily_points_usage(cafeteria_id, usage_date, points_consumed, updated_at)
          VALUES (v_cafe_id, v_today, v_needed, now())
          ON CONFLICT (cafeteria_id, usage_date)
          DO UPDATE SET points_consumed = public.cafeteria_daily_points_usage.points_consumed + EXCLUDED.points_consumed,
                        updated_at = now();
      END IF;

      IF cafe.points_balance <= 0 AND cafe.grace_period_active = false THEN
        UPDATE public.cafeterias SET grace_period_active = true, grace_period_started_at = now()
         WHERE ref_code = NEW.cafeteria_ref_code;
        SELECT COALESCE(grace_days_after_zero, 3) INTO grace_days FROM public.app_settings LIMIT 1;
        grace_days := COALESCE(grace_days, 3);
        grace_hours := grace_days * 24;
        cafe_user := cafe.user_id;
        IF cafe_user IS NOT NULL THEN
          PERFORM public.create_notification(
            cafe_user, 'cafeteria.grace_started', 'رصيد النقاط نفد',
            'لديك ' || grace_hours || ' ساعة لشحن الرصيد قبل إيقاف الكافيتريا.',
            jsonb_build_object('route','/cafeteria/recharge','ref_code', NEW.cafeteria_ref_code));
        END IF;
        FOR owner_user IN SELECT user_id FROM public.user_roles WHERE role = 'owner' LOOP
          PERFORM public.create_notification(
            owner_user, 'cafeteria.grace_started', 'كافيتريا دخلت فترة السماح',
            'الكافيتريا ' || NEW.cafeteria_ref_code || ' نفد رصيدها — ' || grace_hours || ' ساعة متبقية.',
            jsonb_build_object('route','/owner/cafeterias','ref_code', NEW.cafeteria_ref_code));
        END LOOP;
      END IF;
    END IF;
  END IF;

  IF old_settled AND NOT new_settled AND NEW.status = 'cancelled'::order_status THEN
    trial_ok := public.cafeteria_trial_active(NEW.cafeteria_ref_code);
    IF NOT trial_ok THEN
      UPDATE public.cafeterias SET points_balance = points_balance + OLD.total, updated_at = now()
       WHERE ref_code = NEW.cafeteria_ref_code;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

-- 6) Monthly grant function
CREATE OR REPLACE FUNCTION public.monthly_free_points_grant()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  today date := (now() AT TIME ZONE 'UTC')::date;
  granted_count integer := 0;
  expired_count integer := 0;
BEGIN
  -- Deactivate expired grants
  UPDATE public.cafeteria_free_points_grants
     SET is_active = false, updated_at = now()
   WHERE is_active = true AND end_date < today;
  GET DIAGNOSTICS expired_count = ROW_COUNT;

  -- Grant one active row per cafeteria (highest monthly_points wins if multiple)
  FOR r IN
    SELECT DISTINCT ON (cafeteria_id) cafeteria_id, monthly_points
      FROM public.cafeteria_free_points_grants
     WHERE is_active = true AND start_date <= today AND end_date >= today
     ORDER BY cafeteria_id, monthly_points DESC
  LOOP
    INSERT INTO public.cafeteria_free_points_balance(cafeteria_id, free_points, last_grant_date, updated_at)
      VALUES (r.cafeteria_id, r.monthly_points, today, now())
      ON CONFLICT (cafeteria_id) DO UPDATE
        SET free_points = EXCLUDED.free_points,
            last_grant_date = EXCLUDED.last_grant_date,
            updated_at = now();
    granted_count := granted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('granted', granted_count, 'expired', expired_count, 'run_at', now());
END $$;

-- 7) Owner helpers
CREATE OR REPLACE FUNCTION public.owner_grant_free_points(
  _cafeteria_id uuid,
  _monthly_points integer,
  _duration_months integer,
  _start_date date,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_end date;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_end := (_start_date + (_duration_months || ' months')::interval)::date;
  INSERT INTO public.cafeteria_free_points_grants(cafeteria_id, monthly_points, duration_months, start_date, end_date, note)
    VALUES (_cafeteria_id, _monthly_points, _duration_months, _start_date, v_end, _note)
    RETURNING id INTO v_id;

  -- If starts today or earlier, seed balance now
  IF _start_date <= v_today THEN
    INSERT INTO public.cafeteria_free_points_balance(cafeteria_id, free_points, last_grant_date, updated_at)
      VALUES (_cafeteria_id, _monthly_points, v_today, now())
      ON CONFLICT (cafeteria_id) DO UPDATE
        SET free_points = EXCLUDED.free_points,
            last_grant_date = EXCLUDED.last_grant_date,
            updated_at = now();
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.owner_cancel_free_points_grant(_grant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.cafeteria_free_points_grants
     SET is_active = false, updated_at = now()
   WHERE id = _grant_id;
END $$;

GRANT EXECUTE ON FUNCTION public.owner_grant_free_points(uuid,integer,integer,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_cancel_free_points_grant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_free_points_grant() TO service_role;

-- 8) Schedule monthly job (1st day of month at 00:05 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('monthly-free-points-grant')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-free-points-grant');
    PERFORM cron.schedule(
      'monthly-free-points-grant',
      '5 0 1 * *',
      $cmd$ SELECT public.monthly_free_points_grant(); $cmd$
    );
  END IF;
END $$;
