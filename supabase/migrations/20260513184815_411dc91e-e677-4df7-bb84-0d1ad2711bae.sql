DROP POLICY IF EXISTS "Staff requests own shift" ON public.shifts;

CREATE POLICY "Staff requests own shift"
ON public.shifts
FOR INSERT
TO authenticated
WITH CHECK (
  staff_user_id = auth.uid()
  AND cafeteria_ref_code = public.get_my_staff_cafeteria_ref()
  AND EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.cafeteria_ref_code = shifts.cafeteria_ref_code
      AND s.is_active = true
      AND s.role = shifts.staff_role
  )
);