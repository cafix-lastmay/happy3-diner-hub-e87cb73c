
CREATE OR REPLACE FUNCTION public.get_enabled_payment_methods(_ref_code text)
RETURNS TABLE (method public.payment_method_type, wallet_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pm.method, pm.wallet_number
  FROM public.cafeteria_payment_methods pm
  JOIN public.cafeterias c ON c.id = pm.cafeteria_id
  WHERE c.ref_code = _ref_code AND pm.is_enabled = true
  ORDER BY pm.method
$$;
GRANT EXECUTE ON FUNCTION public.get_enabled_payment_methods(text) TO anon, authenticated, service_role;
