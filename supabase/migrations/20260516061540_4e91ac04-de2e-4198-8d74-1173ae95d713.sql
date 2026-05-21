
-- 1. Tighten shifts INSERT policy for cafe admin to validate staff_role matches staff.role
DROP POLICY IF EXISTS "Cafe admin inserts shifts" ON public.shifts;

CREATE POLICY "Cafe admin inserts shifts"
ON public.shifts
FOR INSERT
TO authenticated
WITH CHECK (
  cafeteria_ref_code = public.get_my_cafeteria_ref_code()
  AND EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = shifts.staff_user_id
      AND s.cafeteria_ref_code = shifts.cafeteria_ref_code
      AND s.is_active = true
      AND s.role = shifts.staff_role
  )
);

-- 2. Add scoped SELECT policy so staff can read their own cafeteria row
CREATE POLICY "Staff views own cafeteria"
ON public.cafeterias
FOR SELECT
TO authenticated
USING (ref_code = public.get_my_staff_cafeteria_ref());
