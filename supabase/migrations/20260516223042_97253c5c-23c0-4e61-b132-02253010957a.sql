-- Track self-signup attempts (used by signup-marketer / signup-cafeteria edge functions for rate limiting).
CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('marketer','cafeteria')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip_time
  ON public.signup_attempts (ip, created_at DESC);

ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (which bypasses RLS) may access this table.

-- Atomic rate-limit check + record. Raises SIGNUP_RATE_LIMITED if exceeded.
CREATE OR REPLACE FUNCTION public.check_and_record_signup_attempt(_ip text, _kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per_hour int;
  per_day  int;
BEGIN
  IF _ip IS NULL OR length(_ip) = 0 THEN
    _ip := 'unknown';
  END IF;
  IF _kind NOT IN ('marketer','cafeteria') THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;

  SELECT count(*) INTO per_hour
    FROM public.signup_attempts
   WHERE ip = _ip AND created_at > now() - interval '1 hour';

  SELECT count(*) INTO per_day
    FROM public.signup_attempts
   WHERE ip = _ip AND created_at > now() - interval '1 day';

  IF per_hour >= 5 OR per_day >= 20 THEN
    RAISE EXCEPTION 'SIGNUP_RATE_LIMITED';
  END IF;

  INSERT INTO public.signup_attempts(ip, kind) VALUES (_ip, _kind);

  -- Opportunistic cleanup of rows older than 2 days
  DELETE FROM public.signup_attempts WHERE created_at < now() - interval '2 days';
END $$;

REVOKE EXECUTE ON FUNCTION public.check_and_record_signup_attempt(text, text) FROM PUBLIC, anon, authenticated;