-- Restrict marketers from reading sensitive cafeteria columns.
-- Drop the broad SELECT policy and replace with a SECURITY DEFINER RPC
-- that exposes only non-sensitive identification fields.

DROP POLICY IF EXISTS "Marketer views own cafeterias" ON public.cafeterias;

CREATE OR REPLACE FUNCTION public.get_my_marketer_cafeterias()
RETURNS TABLE (
  ref_code text,
  name text,
  parent_ref_code text,
  is_active boolean,
  created_at timestamptz,
  country_code text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.ref_code, c.name, c.parent_ref_code, c.is_active, c.created_at, c.country_code
  FROM public.cafeterias c
  WHERE public.get_my_marketer_ref_code() IS NOT NULL
    AND (
      c.parent_ref_code = public.get_my_marketer_ref_code()
      OR public.is_ancestor_of(public.get_my_marketer_ref_code(), c.parent_ref_code)
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_marketer_cafeterias() TO authenticated;