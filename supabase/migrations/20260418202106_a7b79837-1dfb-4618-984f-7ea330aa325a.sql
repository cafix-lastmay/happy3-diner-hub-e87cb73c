
-- Harden is_ancestor_of to prevent prefix-collision access.
-- Ref code structure in this project:
--   Parent-created marketer:  parent || NN          (NN = 2 digits, 01..99)
--   Self-signup marketer:     parent || 'N' || NNNN
--   Parent-created cafeteria: parent || 'B' || NN
--   Self-signup cafeteria:    parent || 'B' || NNNN
-- So a true descendant of `_ancestor_code` must:
--   1. Be strictly longer
--   2. Start with `_ancestor_code`
--   3. Have the next character be a digit, 'B', or 'N' (a valid chunk boundary)
CREATE OR REPLACE FUNCTION public.is_ancestor_of(_ancestor_code text, _descendant_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    _ancestor_code IS NOT NULL
    AND _descendant_code IS NOT NULL
    AND length(_descendant_code) > length(_ancestor_code)
    AND left(_descendant_code, length(_ancestor_code)) = _ancestor_code
    AND substr(_descendant_code, length(_ancestor_code) + 1, 1) ~ '^[0-9BN]$'
$$;
