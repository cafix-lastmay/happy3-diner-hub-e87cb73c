CREATE OR REPLACE FUNCTION public.check_and_record_signup_attempt(_ip text, _kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  per_hour int;
  per_day  int;
BEGIN
  IF _ip IS NULL OR length(_ip) = 0 THEN
    _ip := 'unknown';
  END IF;
  IF _kind NOT IN ('marketer','cafeteria','driver') THEN
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

  DELETE FROM public.signup_attempts WHERE created_at < now() - interval '2 days';
END $function$;