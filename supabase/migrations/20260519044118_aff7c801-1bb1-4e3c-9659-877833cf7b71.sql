CREATE OR REPLACE FUNCTION public.cap_driver_radius()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE max_km integer;
BEGIN
  SELECT max_driver_radius_km INTO max_km FROM public.app_settings WHERE id = true LIMIT 1;
  IF max_km IS NOT NULL AND NEW.service_radius_km > max_km THEN
    NEW.service_radius_km := max_km;
  END IF;
  IF NEW.service_radius_km < 1 THEN NEW.service_radius_km := 1; END IF;
  RETURN NEW;
END;
$function$;