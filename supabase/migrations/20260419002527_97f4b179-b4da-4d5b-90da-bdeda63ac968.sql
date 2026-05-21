CREATE OR REPLACE FUNCTION public.realtime_topic_allowed(_topic text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  my_admin text;
  my_mgr text;
  my_staff text;
  prefixes text[] := ARRAY['tables-','orders-','menu-','shifts-','cafe-balance-'];
  p text;
BEGIN
  IF _topic IS NULL OR _topic = '' THEN RETURN false; END IF;

  -- Owners can subscribe anywhere
  IF public.has_role(auth.uid(), 'owner') THEN
    RETURN true;
  END IF;

  my_admin := public.get_my_cafeteria_ref_code();
  my_mgr   := public.get_my_manager_cafeteria_ref();
  my_staff := public.get_my_staff_cafeteria_ref();

  FOREACH p IN ARRAY prefixes LOOP
    IF my_admin IS NOT NULL AND _topic = p || my_admin THEN RETURN true; END IF;
    IF my_mgr   IS NOT NULL AND _topic = p || my_mgr   THEN RETURN true; END IF;
    IF my_staff IS NOT NULL AND _topic = p || my_staff THEN RETURN true; END IF;
  END LOOP;

  RETURN false;
END;
$function$;