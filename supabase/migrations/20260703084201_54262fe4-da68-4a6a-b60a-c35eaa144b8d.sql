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
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  -- 'served' is treated as settled: for dine-in the customer has received the
  -- order at that point, so points must be deducted immediately even if the
  -- waiter never clicks "mark paid" afterwards.
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

      UPDATE public.cafeterias
         SET points_balance = points_balance - NEW.total, updated_at = now()
       WHERE ref_code = NEW.cafeteria_ref_code
       RETURNING * INTO cafe;

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

-- Backfill today's already-served orders that were never charged (so the
-- daily usage indicator reflects reality for orders completed before this fix).
DO $$
DECLARE
  r RECORD;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_cafe_id uuid;
  v_needed integer;
  v_cap integer;
  v_used integer;
BEGIN
  FOR r IN
    SELECT o.id, o.cafeteria_ref_code, o.total
    FROM public.orders o
    WHERE o.status = 'served'::order_status
      AND (o.updated_at AT TIME ZONE 'UTC')::date = v_today
  LOOP
    IF public.cafeteria_trial_active(r.cafeteria_ref_code) THEN CONTINUE; END IF;
    SELECT id INTO v_cafe_id FROM public.cafeterias WHERE ref_code = r.cafeteria_ref_code;
    IF v_cafe_id IS NULL THEN CONTINUE; END IF;
    v_needed := CEIL(COALESCE(r.total, 0))::integer;
    SELECT cap INTO v_cap FROM public.get_effective_daily_cap(r.cafeteria_ref_code);
    SELECT COALESCE(points_consumed, 0) INTO v_used
      FROM public.cafeteria_daily_points_usage
      WHERE cafeteria_id = v_cafe_id AND usage_date = v_today;
    v_used := COALESCE(v_used, 0);
    IF v_cap IS NOT NULL AND v_used + v_needed > v_cap THEN CONTINUE; END IF;

    UPDATE public.cafeterias
       SET points_balance = points_balance - r.total, updated_at = now()
     WHERE ref_code = r.cafeteria_ref_code;

    INSERT INTO public.cafeteria_daily_points_usage(cafeteria_id, usage_date, points_consumed, updated_at)
      VALUES (v_cafe_id, v_today, v_needed, now())
      ON CONFLICT (cafeteria_id, usage_date)
      DO UPDATE SET points_consumed = public.cafeteria_daily_points_usage.points_consumed + EXCLUDED.points_consumed,
                    updated_at = now();
  END LOOP;
END $$;