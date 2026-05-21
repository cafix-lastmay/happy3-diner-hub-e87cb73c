-- Function to fetch staff profiles for a cafeteria admin (bypasses profiles RLS safely)
CREATE OR REPLACE FUNCTION public.get_my_staff_with_profiles()
RETURNS TABLE (
  staff_id uuid,
  user_id uuid,
  role app_role,
  is_active boolean,
  created_at timestamptz,
  email text,
  full_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.user_id, s.role, s.is_active, s.created_at,
         p.email, p.full_name
  FROM public.staff s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.cafeteria_ref_code = public.get_my_cafeteria_ref_code();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_staff_with_profiles() TO authenticated;