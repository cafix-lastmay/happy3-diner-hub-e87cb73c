
-- Helper: is the given cafeteria ref_code a full_cafe?
CREATE OR REPLACE FUNCTION public.is_full_cafe_ref(_ref_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cafeterias
    WHERE ref_code = _ref_code AND business_type = 'full_cafe'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_full_cafe_ref(text) TO authenticated, anon, service_role;

-- restaurant_tables
DROP POLICY IF EXISTS "Cafe manages own tables" ON public.restaurant_tables;
DROP POLICY IF EXISTS "Manager manages tables" ON public.restaurant_tables;
DROP POLICY IF EXISTS "Staff views own cafe tables" ON public.restaurant_tables;

CREATE POLICY "Cafe manages own tables" ON public.restaurant_tables FOR ALL
  USING (cafeteria_ref_code = get_my_cafeteria_ref_code() AND is_full_cafe_ref(cafeteria_ref_code))
  WITH CHECK (cafeteria_ref_code = get_my_cafeteria_ref_code() AND is_full_cafe_ref(cafeteria_ref_code));

CREATE POLICY "Manager manages tables" ON public.restaurant_tables FOR ALL
  USING (cafeteria_ref_code = get_my_manager_cafeteria_ref() AND is_full_cafe_ref(cafeteria_ref_code))
  WITH CHECK (cafeteria_ref_code = get_my_manager_cafeteria_ref() AND is_full_cafe_ref(cafeteria_ref_code));

CREATE POLICY "Staff views own cafe tables" ON public.restaurant_tables FOR SELECT
  USING (cafeteria_ref_code = get_my_staff_cafeteria_ref() AND is_full_cafe_ref(cafeteria_ref_code));

-- table_sections
DROP POLICY IF EXISTS "Cafe manages own sections" ON public.table_sections;
DROP POLICY IF EXISTS "Manager manages sections" ON public.table_sections;
DROP POLICY IF EXISTS "Staff views own cafe sections" ON public.table_sections;

CREATE POLICY "Cafe manages own sections" ON public.table_sections FOR ALL
  USING (cafeteria_ref_code = get_my_cafeteria_ref_code() AND is_full_cafe_ref(cafeteria_ref_code))
  WITH CHECK (cafeteria_ref_code = get_my_cafeteria_ref_code() AND is_full_cafe_ref(cafeteria_ref_code));

CREATE POLICY "Manager manages sections" ON public.table_sections FOR ALL
  USING (cafeteria_ref_code = get_my_manager_cafeteria_ref() AND is_full_cafe_ref(cafeteria_ref_code))
  WITH CHECK (cafeteria_ref_code = get_my_manager_cafeteria_ref() AND is_full_cafe_ref(cafeteria_ref_code));

CREATE POLICY "Staff views own cafe sections" ON public.table_sections FOR SELECT
  USING (cafeteria_ref_code = get_my_staff_cafeteria_ref() AND is_full_cafe_ref(cafeteria_ref_code));

-- staff
DROP POLICY IF EXISTS "Cafe manages own staff" ON public.staff;
DROP POLICY IF EXISTS "Manager manages non-admin staff" ON public.staff;

CREATE POLICY "Cafe manages own staff" ON public.staff FOR ALL
  USING (cafeteria_ref_code = get_my_cafeteria_ref_code() AND is_full_cafe_ref(cafeteria_ref_code))
  WITH CHECK (cafeteria_ref_code = get_my_cafeteria_ref_code() AND is_full_cafe_ref(cafeteria_ref_code));

CREATE POLICY "Manager manages non-admin staff" ON public.staff FOR ALL
  USING (
    cafeteria_ref_code = get_my_manager_cafeteria_ref()
    AND role = ANY (ARRAY['waiter'::app_role, 'chef'::app_role])
    AND is_full_cafe_ref(cafeteria_ref_code)
  )
  WITH CHECK (
    cafeteria_ref_code = get_my_manager_cafeteria_ref()
    AND role = ANY (ARRAY['waiter'::app_role, 'chef'::app_role])
    AND is_full_cafe_ref(cafeteria_ref_code)
  );

-- shifts
DROP POLICY IF EXISTS "Cafe admin inserts shifts" ON public.shifts;
DROP POLICY IF EXISTS "Cafe admin/manager updates shifts" ON public.shifts;
DROP POLICY IF EXISTS "Cafe admin/manager views shifts" ON public.shifts;
DROP POLICY IF EXISTS "Staff requests own shift" ON public.shifts;

CREATE POLICY "Cafe admin inserts shifts" ON public.shifts FOR INSERT
  WITH CHECK (
    cafeteria_ref_code = get_my_cafeteria_ref_code()
    AND is_full_cafe_ref(cafeteria_ref_code)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = shifts.staff_user_id
        AND s.cafeteria_ref_code = shifts.cafeteria_ref_code
        AND s.is_active = true
        AND s.role = shifts.staff_role
    )
  );

CREATE POLICY "Cafe admin/manager updates shifts" ON public.shifts FOR UPDATE
  USING (is_cafe_admin_or_manager(cafeteria_ref_code) AND is_full_cafe_ref(cafeteria_ref_code));

CREATE POLICY "Cafe admin/manager views shifts" ON public.shifts FOR SELECT
  USING (is_cafe_admin_or_manager(cafeteria_ref_code) AND is_full_cafe_ref(cafeteria_ref_code));

CREATE POLICY "Staff requests own shift" ON public.shifts FOR INSERT
  WITH CHECK (
    staff_user_id = auth.uid()
    AND cafeteria_ref_code = get_my_staff_cafeteria_ref()
    AND is_full_cafe_ref(cafeteria_ref_code)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.cafeteria_ref_code = shifts.cafeteria_ref_code
        AND s.is_active = true
        AND s.role = shifts.staff_role
    )
  );
