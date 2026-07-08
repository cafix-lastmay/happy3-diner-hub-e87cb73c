
CREATE OR REPLACE FUNCTION public.catchup_free_points_balances(_cafeteria_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (g.cafeteria_id) g.cafeteria_id, g.monthly_points, g.start_date
      FROM public.cafeteria_free_points_grants g
     WHERE g.is_active = true
       AND g.start_date <= today
       AND g.end_date   >= today
       AND (_cafeteria_id IS NULL OR g.cafeteria_id = _cafeteria_id)
     ORDER BY g.cafeteria_id, g.monthly_points DESC
  LOOP
    INSERT INTO public.cafeteria_free_points_balance(cafeteria_id, free_points, last_grant_date, updated_at)
      VALUES (r.cafeteria_id, r.monthly_points, r.start_date, now())
    ON CONFLICT (cafeteria_id) DO UPDATE
      SET free_points     = GREATEST(public.cafeteria_free_points_balance.free_points, EXCLUDED.free_points),
          last_grant_date = GREATEST(public.cafeteria_free_points_balance.last_grant_date, EXCLUDED.last_grant_date),
          updated_at      = now()
      WHERE public.cafeteria_free_points_balance.last_grant_date IS NULL
         OR public.cafeteria_free_points_balance.last_grant_date < EXCLUDED.last_grant_date;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.catchup_free_points_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catchup_free_points_balances(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_free_points()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cafe uuid;
  v_points integer;
BEGIN
  SELECT id INTO v_cafe FROM public.cafeterias WHERE user_id = auth.uid() LIMIT 1;
  IF v_cafe IS NULL THEN RETURN 0; END IF;
  PERFORM public.catchup_free_points_balances(v_cafe);
  SELECT free_points INTO v_points FROM public.cafeteria_free_points_balance WHERE cafeteria_id = v_cafe;
  RETURN COALESCE(v_points, 0);
END $$;

REVOKE ALL ON FUNCTION public.get_my_free_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_free_points() TO authenticated;

SELECT public.catchup_free_points_balances(NULL);
