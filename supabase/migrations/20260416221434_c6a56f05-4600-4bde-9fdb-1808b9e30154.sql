CREATE OR REPLACE FUNCTION public.is_ancestor_of(_ancestor_code TEXT, _descendant_code TEXT)
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE SET search_path = public AS $$
  SELECT _descendant_code LIKE (_ancestor_code || '%') AND _descendant_code <> _ancestor_code AND _ancestor_code IS NOT NULL
$$;