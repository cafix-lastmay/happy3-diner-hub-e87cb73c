
-- Enable RLS on realtime.messages and scope subscriptions by cafeteria affiliation
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Helper: check if a topic string belongs to a cafeteria the current user is affiliated with.
-- Channel naming convention used in this app:
--   orders-<ref>, menu-<ref>, tables-<ref>, sections-<ref>, cafe-balance-<ref>, recharges-<ref>, shifts-<ref>
-- We extract the suffix after the LAST '-' and compare to the user's cafeteria refs.
CREATE OR REPLACE FUNCTION public.realtime_topic_allowed(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  suffix text;
  my_admin text;
  my_mgr text;
  my_staff text;
BEGIN
  IF _topic IS NULL THEN RETURN false; END IF;

  -- Owners can subscribe anywhere
  IF public.has_role(auth.uid(), 'owner') THEN
    RETURN true;
  END IF;

  -- Extract the part after the last '-' (the ref_code suffix)
  suffix := split_part(_topic, '-', array_length(string_to_array(_topic, '-'), 1));
  IF suffix IS NULL OR suffix = '' THEN
    RETURN false;
  END IF;

  my_admin := public.get_my_cafeteria_ref_code();
  my_mgr   := public.get_my_manager_cafeteria_ref();
  my_staff := public.get_my_staff_cafeteria_ref();

  RETURN suffix = my_admin OR suffix = my_mgr OR suffix = my_staff;
END;
$$;

-- Drop any prior policies we may have created
DROP POLICY IF EXISTS "Authenticated users subscribe to own cafeteria topics" ON realtime.messages;

-- Only authenticated users, only for topics matching their cafeteria affiliation
CREATE POLICY "Authenticated users subscribe to own cafeteria topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.realtime_topic_allowed(realtime.topic()));
