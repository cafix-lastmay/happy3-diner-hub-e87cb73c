-- 1. Remove overly-permissive marketer self-update policy and create safe profile RPC
DROP POLICY IF EXISTS "Marketer updates self" ON public.marketers;

CREATE OR REPLACE FUNCTION public.update_my_marketer_profile(
  _name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _whatsapp text DEFAULT NULL,
  _address text DEFAULT NULL,
  _language text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.marketers
  SET name      = COALESCE(_name, name),
      phone     = COALESCE(_phone, phone),
      whatsapp  = COALESCE(_whatsapp, whatsapp),
      address   = COALESCE(_address, address),
      language  = COALESCE(_language, language),
      updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_marketer_profile(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_marketer_profile(text,text,text,text,text) TO authenticated;

-- 2. Restrict commission_rates read access to authenticated users only
DROP POLICY IF EXISTS "Anyone reads commission rates" ON public.commission_rates;
CREATE POLICY "Authenticated reads commission rates"
ON public.commission_rates
FOR SELECT
TO authenticated
USING (true);

-- 3. Revoke public/anon access to generate_ref_code (only used via service role in edge functions)
REVOKE ALL ON FUNCTION public.generate_ref_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_ref_code(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.generate_ref_code(text, text) FROM authenticated;