
-- 1) Hide customer_phone column on ratings from authenticated reads (column-level grant).
REVOKE SELECT ON public.ratings FROM authenticated, anon;
GRANT SELECT (id, target_kind, target_ref, order_id, stars, comment, created_at)
  ON public.ratings TO authenticated, anon;

-- 2) Make get_my_staff_cafeteria_ref deterministic to prevent cross-cafeteria leakage
CREATE OR REPLACE FUNCTION public.get_my_staff_cafeteria_ref()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cafeteria_ref_code
  FROM public.staff
  WHERE user_id = auth.uid() AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1
$function$;

-- Prevent multiple active staff rows per user across cafeterias going forward
CREATE UNIQUE INDEX IF NOT EXISTS staff_one_active_per_user
  ON public.staff (user_id)
  WHERE is_active = true;
