-- 1) Add shift_enabled to staff
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS shift_enabled boolean NOT NULL DEFAULT false;

-- 2) Staff scopes table
CREATE TABLE IF NOT EXISTS public.staff_scopes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('category','section')),
  ref_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, kind, ref_id)
);

ALTER TABLE public.staff_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cafe admin manages staff scopes"
ON public.staff_scopes FOR ALL
USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_scopes.staff_id AND s.cafeteria_ref_code = public.get_my_cafeteria_ref_code()))
WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_scopes.staff_id AND s.cafeteria_ref_code = public.get_my_cafeteria_ref_code()));

CREATE POLICY "Manager manages staff scopes"
ON public.staff_scopes FOR ALL
USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_scopes.staff_id AND s.cafeteria_ref_code = public.get_my_manager_cafeteria_ref() AND s.role IN ('waiter','chef')))
WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_scopes.staff_id AND s.cafeteria_ref_code = public.get_my_manager_cafeteria_ref() AND s.role IN ('waiter','chef')));

CREATE POLICY "Staff views own scopes"
ON public.staff_scopes FOR SELECT
USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_scopes.staff_id AND s.user_id = auth.uid()));

CREATE POLICY "Owner views all staff scopes"
ON public.staff_scopes FOR SELECT
USING (public.has_role(auth.uid(), 'owner'));

-- 3) set_staff_shift_enabled
CREATE OR REPLACE FUNCTION public.set_staff_shift_enabled(_staff_id uuid, _enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  is_admin boolean;
  is_manager boolean;
BEGIN
  SELECT * INTO s FROM public.staff WHERE id = _staff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff not found'; END IF;

  is_admin := s.cafeteria_ref_code = public.get_my_cafeteria_ref_code();
  is_manager := s.cafeteria_ref_code = public.get_my_manager_cafeteria_ref() AND s.role IN ('waiter','chef');

  IF NOT (is_admin OR is_manager) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.staff SET shift_enabled = _enabled WHERE id = _staff_id;

  IF _enabled THEN
    UPDATE public.shifts
    SET status = 'active', approved_at = COALESCE(approved_at, now()), approved_by = COALESCE(approved_by, auth.uid())
    WHERE staff_user_id = s.user_id AND status = 'pending';
  ELSE
    UPDATE public.shifts
    SET status = 'closed', closed_at = now(), closed_by = auth.uid()
    WHERE staff_user_id = s.user_id AND status IN ('active','pending');
  END IF;
END;
$$;

-- 4) request_shift honoring shift_enabled
CREATE OR REPLACE FUNCTION public.request_shift()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  new_id uuid;
  existing RECORD;
BEGIN
  SELECT * INTO s FROM public.staff WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a staff member'; END IF;

  SELECT * INTO existing FROM public.shifts
  WHERE staff_user_id = auth.uid() AND status IN ('pending','active')
  ORDER BY requested_at DESC LIMIT 1;
  IF FOUND THEN RETURN existing.id; END IF;

  IF s.shift_enabled THEN
    INSERT INTO public.shifts(cafeteria_ref_code, staff_user_id, staff_role, status, approved_at, approved_by)
    VALUES (s.cafeteria_ref_code, auth.uid(), s.role, 'active', now(), auth.uid())
    RETURNING id INTO new_id;
  ELSE
    INSERT INTO public.shifts(cafeteria_ref_code, staff_user_id, staff_role, status)
    VALUES (s.cafeteria_ref_code, auth.uid(), s.role, 'pending')
    RETURNING id INTO new_id;
  END IF;

  RETURN new_id;
END;
$$;

-- 5) set_staff_scopes
CREATE OR REPLACE FUNCTION public.set_staff_scopes(_staff_id uuid, _kind text, _ref_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  is_admin boolean;
  is_manager boolean;
  rid uuid;
BEGIN
  IF _kind NOT IN ('category','section') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  SELECT * INTO s FROM public.staff WHERE id = _staff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff not found'; END IF;

  is_admin := s.cafeteria_ref_code = public.get_my_cafeteria_ref_code();
  is_manager := s.cafeteria_ref_code = public.get_my_manager_cafeteria_ref() AND s.role IN ('waiter','chef');
  IF NOT (is_admin OR is_manager) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF _kind = 'category' AND s.role <> 'chef' THEN RAISE EXCEPTION 'Categories only for chefs'; END IF;
  IF _kind = 'section' AND s.role <> 'waiter' THEN RAISE EXCEPTION 'Sections only for waiters'; END IF;

  DELETE FROM public.staff_scopes WHERE staff_id = _staff_id AND kind = _kind;

  IF _ref_ids IS NOT NULL THEN
    FOREACH rid IN ARRAY _ref_ids LOOP
      INSERT INTO public.staff_scopes(staff_id, kind, ref_id) VALUES (_staff_id, _kind, rid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END;
$$;

-- 6) get_my_staff_scopes
CREATE OR REPLACE FUNCTION public.get_my_staff_scopes()
RETURNS TABLE(kind text, ref_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sc.kind, sc.ref_id
  FROM public.staff_scopes sc
  JOIN public.staff s ON s.id = sc.staff_id
  WHERE s.user_id = auth.uid() AND s.is_active = true;
$$;

-- 7) Recreate get_my_staff_with_profiles with shift_enabled + manager scope
DROP FUNCTION IF EXISTS public.get_my_staff_with_profiles();

CREATE OR REPLACE FUNCTION public.get_my_staff_with_profiles()
RETURNS TABLE(staff_id uuid, user_id uuid, role app_role, is_active boolean, shift_enabled boolean, created_at timestamptz, email text, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.user_id, s.role, s.is_active, s.shift_enabled, s.created_at, p.email, p.full_name
  FROM public.staff s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.cafeteria_ref_code = public.get_my_cafeteria_ref_code()
     OR (s.cafeteria_ref_code = public.get_my_manager_cafeteria_ref() AND s.role IN ('waiter','chef'));
$$;