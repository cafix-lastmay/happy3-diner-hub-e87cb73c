-- Audit log for blocked privileged-route access attempts
CREATE TABLE IF NOT EXISTS public.unauthorized_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  path text NOT NULL,
  attempted_roles text[] NOT NULL DEFAULT '{}',
  user_roles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unauthorized_access_log ENABLE ROW LEVEL SECURITY;

-- Only owners can read the log
CREATE POLICY "Owner reads unauthorized access log"
ON public.unauthorized_access_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner'));

-- Authenticated users can insert their own attempt rows (forced via RPC below)
CREATE POLICY "Users insert own unauthorized attempts"
ON public.unauthorized_access_log
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_unauth_log_user_created
  ON public.unauthorized_access_log(user_id, created_at DESC);

-- Helper RPC: client cannot spoof user_id; we always use auth.uid().
-- Returns void; safe to ignore failures on the client.
CREATE OR REPLACE FUNCTION public.log_unauthorized_access(
  _path text,
  _attempted_roles text[] DEFAULT '{}'::text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_roles text[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF _path IS NULL OR length(_path) = 0 OR length(_path) > 512 THEN RETURN; END IF;

  SELECT COALESCE(array_agg(role::text), '{}'::text[]) INTO my_roles
  FROM public.user_roles WHERE user_id = auth.uid();

  INSERT INTO public.unauthorized_access_log(user_id, path, attempted_roles, user_roles)
  VALUES (auth.uid(), _path, COALESCE(_attempted_roles, '{}'::text[]), my_roles);
END;
$$;

REVOKE ALL ON FUNCTION public.log_unauthorized_access(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_unauthorized_access(text, text[]) TO authenticated;