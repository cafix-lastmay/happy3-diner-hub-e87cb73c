
CREATE TABLE public.cafeteria_daily_points_cap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_id uuid REFERENCES public.cafeterias(id) ON DELETE CASCADE,
  country_code text REFERENCES public.countries(code) ON DELETE CASCADE,
  daily_cap integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cap_scope_valid CHECK (NOT (cafeteria_id IS NOT NULL AND country_code IS NOT NULL)),
  CONSTRAINT cap_daily_nonneg CHECK (daily_cap IS NULL OR daily_cap >= 0)
);

CREATE UNIQUE INDEX cap_unique_cafeteria ON public.cafeteria_daily_points_cap(cafeteria_id) WHERE cafeteria_id IS NOT NULL;
CREATE UNIQUE INDEX cap_unique_country ON public.cafeteria_daily_points_cap(country_code) WHERE country_code IS NOT NULL AND cafeteria_id IS NULL;
CREATE UNIQUE INDEX cap_unique_global ON public.cafeteria_daily_points_cap((true)) WHERE cafeteria_id IS NULL AND country_code IS NULL;

GRANT SELECT ON public.cafeteria_daily_points_cap TO authenticated;
GRANT ALL ON public.cafeteria_daily_points_cap TO service_role;

ALTER TABLE public.cafeteria_daily_points_cap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages caps"
  ON public.cafeteria_daily_points_cap FOR ALL
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Cafe reads applicable caps"
  ON public.cafeteria_daily_points_cap FOR SELECT
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR (cafeteria_id IS NULL AND country_code IS NULL)
    OR (
      cafeteria_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.cafeterias c
        WHERE c.id = cafeteria_daily_points_cap.cafeteria_id
          AND (c.user_id = auth.uid() OR c.ref_code = public.get_my_manager_cafeteria_ref())
      )
    )
    OR (
      country_code IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.cafeterias c
        WHERE c.country_code = cafeteria_daily_points_cap.country_code
          AND (c.user_id = auth.uid() OR c.ref_code = public.get_my_manager_cafeteria_ref())
      )
    )
  );

CREATE TRIGGER tr_caps_updated
  BEFORE UPDATE ON public.cafeteria_daily_points_cap
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE public.cafeteria_daily_points_usage (
  cafeteria_id uuid NOT NULL REFERENCES public.cafeterias(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  points_consumed integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cafeteria_id, usage_date)
);

GRANT SELECT ON public.cafeteria_daily_points_usage TO authenticated;
GRANT ALL ON public.cafeteria_daily_points_usage TO service_role;

ALTER TABLE public.cafeteria_daily_points_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads all usage"
  ON public.cafeteria_daily_points_usage FOR SELECT
  USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Cafe reads own usage"
  ON public.cafeteria_daily_points_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cafeterias c
      WHERE c.id = cafeteria_daily_points_usage.cafeteria_id
        AND (c.user_id = auth.uid() OR c.ref_code = public.get_my_manager_cafeteria_ref())
    )
  );

CREATE OR REPLACE FUNCTION public.get_effective_daily_cap(_ref_code text)
RETURNS TABLE(cap integer, scope text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cafe_id uuid;
  v_country text;
  v_cap integer;
BEGIN
  SELECT id, country_code INTO v_cafe_id, v_country FROM public.cafeterias WHERE ref_code = _ref_code;
  IF v_cafe_id IS NULL THEN RETURN; END IF;

  SELECT daily_cap INTO v_cap FROM public.cafeteria_daily_points_cap
    WHERE cafeteria_id = v_cafe_id AND is_active = true;
  IF FOUND THEN cap := v_cap; scope := 'cafeteria'; RETURN NEXT; RETURN; END IF;

  IF v_country IS NOT NULL THEN
    SELECT daily_cap INTO v_cap FROM public.cafeteria_daily_points_cap
      WHERE country_code = v_country AND cafeteria_id IS NULL AND is_active = true;
    IF FOUND THEN cap := v_cap; scope := 'country'; RETURN NEXT; RETURN; END IF;
  END IF;

  SELECT daily_cap INTO v_cap FROM public.cafeteria_daily_points_cap
    WHERE cafeteria_id IS NULL AND country_code IS NULL AND is_active = true;
  IF FOUND THEN cap := v_cap; scope := 'global'; RETURN NEXT; RETURN; END IF;

  cap := NULL; scope := 'none'; RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.get_effective_daily_cap(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_daily_points_cap_status(_ref_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cafe_id uuid;
  v_cap integer;
  v_scope text;
  v_used integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_cafe_id FROM public.cafeterias
    WHERE ref_code = _ref_code
      AND (user_id = auth.uid() OR ref_code = public.get_my_manager_cafeteria_ref()
           OR public.has_role(auth.uid(), 'owner'::app_role));
  IF v_cafe_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT cap, scope INTO v_cap, v_scope FROM public.get_effective_daily_cap(_ref_code);
  SELECT COALESCE(points_consumed, 0) INTO v_used FROM public.cafeteria_daily_points_usage
    WHERE cafeteria_id = v_cafe_id AND usage_date = (now() AT TIME ZONE 'UTC')::date;

  RETURN jsonb_build_object('cap', v_cap, 'scope', v_scope, 'used', COALESCE(v_used, 0));
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_daily_points_cap_status(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_list_daily_caps()
RETURNS TABLE(id uuid, scope text, cafeteria_id uuid, cafeteria_ref_code text, cafeteria_name text,
              country_code text, country_name text, daily_cap integer, is_active boolean, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.id,
    CASE WHEN x.cafeteria_id IS NOT NULL THEN 'cafeteria'
         WHEN x.country_code IS NOT NULL THEN 'country' ELSE 'global' END,
    x.cafeteria_id, c.ref_code, c.name, x.country_code, co.name_ar, x.daily_cap, x.is_active, x.updated_at
  FROM public.cafeteria_daily_points_cap x
  LEFT JOIN public.cafeterias c ON c.id = x.cafeteria_id
  LEFT JOIN public.countries co ON co.code = x.country_code
  WHERE public.has_role(auth.uid(), 'owner'::app_role)
  ORDER BY CASE WHEN x.cafeteria_id IS NOT NULL THEN 1 WHEN x.country_code IS NOT NULL THEN 2 ELSE 3 END,
           c.name NULLS LAST, co.name_ar NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.owner_list_daily_caps() TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_upsert_daily_cap(
  _cafeteria_id uuid, _country_code text, _daily_cap integer, _is_active boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _cafeteria_id IS NOT NULL AND _country_code IS NOT NULL THEN
    RAISE EXCEPTION 'Choose either cafeteria or country, not both';
  END IF;

  IF _cafeteria_id IS NOT NULL THEN
    INSERT INTO public.cafeteria_daily_points_cap(cafeteria_id, daily_cap, is_active)
      VALUES (_cafeteria_id, _daily_cap, _is_active)
      ON CONFLICT (cafeteria_id) WHERE cafeteria_id IS NOT NULL
      DO UPDATE SET daily_cap = EXCLUDED.daily_cap, is_active = EXCLUDED.is_active, updated_at = now()
      RETURNING id INTO v_id;
  ELSIF _country_code IS NOT NULL THEN
    INSERT INTO public.cafeteria_daily_points_cap(country_code, daily_cap, is_active)
      VALUES (_country_code, _daily_cap, _is_active)
      ON CONFLICT (country_code) WHERE country_code IS NOT NULL AND cafeteria_id IS NULL
      DO UPDATE SET daily_cap = EXCLUDED.daily_cap, is_active = EXCLUDED.is_active, updated_at = now()
      RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.cafeteria_daily_points_cap(daily_cap, is_active)
      VALUES (_daily_cap, _is_active)
      ON CONFLICT ((true)) WHERE cafeteria_id IS NULL AND country_code IS NULL
      DO UPDATE SET daily_cap = EXCLUDED.daily_cap, is_active = EXCLUDED.is_active, updated_at = now()
      RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.owner_upsert_daily_cap(uuid,text,integer,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_delete_daily_cap(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.cafeteria_daily_points_cap WHERE id = _id;
END $$;

GRANT EXECUTE ON FUNCTION public.owner_delete_daily_cap(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_order_points_on_paid()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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

  old_settled := OLD.status IN ('paid'::order_status, 'paid_at_counter'::order_status);
  new_settled := NEW.status IN ('paid'::order_status, 'paid_at_counter'::order_status);

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
