-- Add auto-approve shifts setting
ALTER TABLE public.cafeterias
ADD COLUMN IF NOT EXISTS auto_approve_shifts boolean NOT NULL DEFAULT true;

-- Update request_shift RPC to honor auto-approve flag
CREATE OR REPLACE FUNCTION public.request_shift()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s RECORD;
  c RECORD;
  new_id uuid;
  existing RECORD;
  auto_ok boolean;
BEGIN
  SELECT * INTO s FROM public.staff WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a staff member'; END IF;

  SELECT * INTO existing FROM public.shifts
  WHERE staff_user_id = auth.uid() AND status IN ('pending','active')
  ORDER BY requested_at DESC LIMIT 1;
  IF FOUND THEN RETURN existing.id; END IF;

  SELECT auto_approve_shifts INTO auto_ok FROM public.cafeterias WHERE ref_code = s.cafeteria_ref_code;

  IF s.shift_enabled OR COALESCE(auto_ok, true) THEN
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
$function$;