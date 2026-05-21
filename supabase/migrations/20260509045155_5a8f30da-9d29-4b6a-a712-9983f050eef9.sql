
-- 1) Marketers: drop descendant SELECT policy, replace with safe RPC
DROP POLICY IF EXISTS "Marketer views descendants" ON public.marketers;

CREATE OR REPLACE FUNCTION public.get_my_marketer_descendants()
RETURNS TABLE(ref_code text, name text, parent_ref_code text, level int, is_active boolean, country_code text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.ref_code, m.name, m.parent_ref_code, m.level, m.is_active, m.country_code, m.created_at
  FROM public.marketers m
  WHERE public.get_my_marketer_ref_code() IS NOT NULL
    AND public.is_ancestor_of(public.get_my_marketer_ref_code(), m.ref_code);
$$;

-- 2) Cafeterias: protect sensitive fields via BEFORE UPDATE trigger
CREATE OR REPLACE FUNCTION public.protect_cafeteria_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'owner') THEN
    RETURN NEW;
  END IF;
  -- Cafeteria admin update path: lock down sensitive fields
  NEW.points_balance := OLD.points_balance;
  NEW.free_trial_until := OLD.free_trial_until;
  NEW.trial_consumed := OLD.trial_consumed;
  NEW.trial_start := OLD.trial_start;
  NEW.is_active := OLD.is_active;
  NEW.signup_type := OLD.signup_type;
  NEW.ref_code := OLD.ref_code;
  NEW.parent_ref_code := OLD.parent_ref_code;
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_cafeteria_sensitive ON public.cafeterias;
CREATE TRIGGER trg_protect_cafeteria_sensitive
BEFORE UPDATE ON public.cafeterias
FOR EACH ROW EXECUTE FUNCTION public.protect_cafeteria_sensitive_fields();

-- 3) order_items: explicit write policies for cafe admin/manager
CREATE POLICY "Cafe admin/manager inserts order items"
ON public.order_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o
          WHERE o.id = order_items.order_id
            AND public.is_cafe_admin_or_manager(o.cafeteria_ref_code))
);

CREATE POLICY "Cafe admin/manager updates order items"
ON public.order_items FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.orders o
          WHERE o.id = order_items.order_id
            AND public.is_cafe_admin_or_manager(o.cafeteria_ref_code))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o
          WHERE o.id = order_items.order_id
            AND public.is_cafe_admin_or_manager(o.cafeteria_ref_code))
);

CREATE POLICY "Cafe admin/manager deletes order items"
ON public.order_items FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.orders o
          WHERE o.id = order_items.order_id
            AND public.is_cafe_admin_or_manager(o.cafeteria_ref_code))
);

-- 4) Shifts: tighten cafe admin INSERT to require staff_user_id belongs to same cafeteria
DROP POLICY IF EXISTS "Cafe admin inserts shifts" ON public.shifts;
CREATE POLICY "Cafe admin inserts shifts"
ON public.shifts FOR INSERT TO authenticated
WITH CHECK (
  cafeteria_ref_code = public.get_my_cafeteria_ref_code()
  AND EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = shifts.staff_user_id
      AND s.cafeteria_ref_code = shifts.cafeteria_ref_code
      AND s.is_active = true
  )
);

-- 5) recharge_requests: explicit owner DELETE policy
CREATE POLICY "Owner deletes recharges"
ON public.recharge_requests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner'));

-- 6) Storage: drop legacy UUID-scoped policies; cafeteria-scoped policies remain
DROP POLICY IF EXISTS "Cafe uploads menu images" ON storage.objects;
DROP POLICY IF EXISTS "Cafe updates own menu images" ON storage.objects;
DROP POLICY IF EXISTS "Cafe deletes own menu images" ON storage.objects;
DROP POLICY IF EXISTS "Cafeteria uploads own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Cafeteria reads own receipts" ON storage.objects;

-- 7) Lock down SECURITY DEFINER function execution
-- Revoke from PUBLIC on all public functions, then re-grant where appropriate
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Anon-callable (QR / public customer flow)
GRANT EXECUTE ON FUNCTION public.get_menu_for_qr(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_status(uuid, text) TO anon, authenticated;

-- Authenticated-callable (used by app code via RLS-aware contexts)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_cafe_admin_or_manager(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ancestor_of(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_cafeteria_ref_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_manager_cafeteria_ref() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_marketer_ref_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_staff_cafeteria_ref() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_active_shift() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_staff_scopes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_staff_with_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_waiter_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_marketer_cafeterias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_marketer_descendants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cafeteria_trial_active(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.realtime_topic_allowed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.table_is_occupied(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_requires_chef(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_has_chef_items(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_marketer_profile(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_unauthorized_access(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_shift() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, order_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_scopes(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_shift_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_price_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_shift(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cafe_sales_by_tier_daily(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_recharge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_recharge_with_points(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_recharge(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_adjust_cafeteria_points(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_adjust_marketer_balance(text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_get_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_recharges_timeseries(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_signups_timeseries(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_top_cafeterias(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_top_marketers(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_set_cafeteria_trial(text, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_set_default_trial_days(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_set_footer_banner(text, text, text, boolean) TO authenticated;
