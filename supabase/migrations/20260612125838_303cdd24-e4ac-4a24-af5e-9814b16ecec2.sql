DROP POLICY IF EXISTS "Anyone reads instructions" ON public.recharge_instructions;
DROP POLICY IF EXISTS "Authenticated reads instructions" ON public.recharge_instructions;
CREATE POLICY "Authenticated reads instructions" ON public.recharge_instructions FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.recharge_instructions FROM anon;
GRANT SELECT ON public.recharge_instructions TO authenticated;