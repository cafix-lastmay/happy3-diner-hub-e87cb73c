
-- Cafe admin/manager invites an existing driver by email or phone.
-- Creates an approved driver_cafeteria_link directly.
CREATE OR REPLACE FUNCTION public.cafe_invite_driver(_query text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cafe_ref text;
  v_driver_id uuid;
  v_user_id uuid;
  v_link_id uuid;
  v_query text := lower(trim(_query));
BEGIN
  -- Resolve caller's cafeteria (admin or manager)
  SELECT get_my_cafeteria_ref_code() INTO v_cafe_ref;
  IF v_cafe_ref IS NULL THEN
    SELECT get_my_manager_cafeteria_ref() INTO v_cafe_ref;
  END IF;
  IF v_cafe_ref IS NULL THEN RAISE EXCEPTION 'NOT_CAFE_ADMIN'; END IF;

  IF v_query IS NULL OR v_query = '' THEN RAISE EXCEPTION 'EMPTY_QUERY'; END IF;

  -- Try by phone in drivers table
  SELECT id, user_id INTO v_driver_id, v_user_id
  FROM public.drivers
  WHERE lower(phone) = v_query
  LIMIT 1;

  -- Try by email in auth.users
  IF v_driver_id IS NULL THEN
    SELECT u.id INTO v_user_id FROM auth.users u WHERE lower(u.email) = v_query LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_user_id LIMIT 1;
    END IF;
  END IF;

  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'DRIVER_NOT_FOUND'; END IF;

  -- Upsert as approved
  SELECT id INTO v_link_id FROM public.driver_cafeteria_links
  WHERE driver_id = v_driver_id AND cafeteria_ref_code = v_cafe_ref LIMIT 1;

  IF v_link_id IS NULL THEN
    INSERT INTO public.driver_cafeteria_links (driver_id, cafeteria_ref_code, status, decided_at, decided_by)
    VALUES (v_driver_id, v_cafe_ref, 'approved', now(), auth.uid())
    RETURNING id INTO v_link_id;
  ELSE
    UPDATE public.driver_cafeteria_links
    SET status = 'approved', decided_at = now(), decided_by = auth.uid()
    WHERE id = v_link_id;
  END IF;

  RETURN v_link_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cafe_invite_driver(text) TO authenticated;
