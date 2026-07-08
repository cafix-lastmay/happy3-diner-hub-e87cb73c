
DROP FUNCTION IF EXISTS public.owner_cancel_free_points_grant(uuid);

CREATE OR REPLACE FUNCTION public.owner_cancel_free_points_grant(_grant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cafe uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.cafeteria_free_points_grants
     SET is_active = false, updated_at = now()
   WHERE id = _grant_id
   RETURNING cafeteria_id INTO v_cafe;

  IF v_cafe IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cafeteria_free_points_grants
     WHERE cafeteria_id = v_cafe
       AND is_active = true
       AND start_date <= (now() AT TIME ZONE 'UTC')::date
       AND end_date   >= (now() AT TIME ZONE 'UTC')::date
  ) THEN
    UPDATE public.cafeteria_free_points_balance
       SET free_points = 0, updated_at = now()
     WHERE cafeteria_id = v_cafe;
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.owner_cancel_free_points_grant(uuid) TO authenticated;
