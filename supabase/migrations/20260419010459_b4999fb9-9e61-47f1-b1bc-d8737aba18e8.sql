-- 1) Strict role-based status transitions. Remove waiter "no chef items" bypass entirely.
CREATE OR REPLACE FUNCTION public.set_order_status(_order_id uuid, _new_status order_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
  my_role app_role;
  is_admin boolean;
  is_manager boolean;
  is_waiter boolean;
  is_chef boolean;
  has_active_shift boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  is_admin   := o.cafeteria_ref_code = public.get_my_cafeteria_ref_code();
  is_manager := o.cafeteria_ref_code = public.get_my_manager_cafeteria_ref();

  SELECT role INTO my_role FROM public.staff
    WHERE user_id = auth.uid() AND cafeteria_ref_code = o.cafeteria_ref_code AND is_active = true LIMIT 1;
  is_waiter := my_role = 'waiter';
  is_chef   := my_role = 'chef';

  IF NOT (is_admin OR is_manager OR is_waiter OR is_chef) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Staff must have an active shift
  IF (is_waiter OR is_chef) THEN
    SELECT EXISTS(SELECT 1 FROM public.shifts WHERE staff_user_id = auth.uid() AND status = 'active')
      INTO has_active_shift;
    IF NOT has_active_shift THEN RAISE EXCEPTION 'Active shift required'; END IF;
  END IF;

  -- Cancellation: admin/manager/waiter only, only from new/preparing
  IF _new_status = 'cancelled' THEN
    IF NOT (is_admin OR is_manager OR is_waiter) THEN RAISE EXCEPTION 'Not allowed to cancel'; END IF;
    IF o.status NOT IN ('new','preparing') THEN RAISE EXCEPTION 'Cannot cancel in this status'; END IF;
    UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = _order_id;
    RETURN;
  END IF;

  -- Admin/manager bypass transition rules (for ops correction)
  IF is_admin OR is_manager THEN
    UPDATE public.orders SET status = _new_status, updated_at = now() WHERE id = _order_id;
    RETURN;
  END IF;

  -- Waiter strict transitions (NO preparing->ready under any condition)
  IF is_waiter THEN
    IF o.status = 'new' AND _new_status = 'preparing' THEN
      UPDATE public.orders SET status = 'preparing', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'ready' AND _new_status = 'served' THEN
      UPDATE public.orders SET status = 'served', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'served' AND _new_status = 'paid' THEN
      UPDATE public.orders SET status = 'paid', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Invalid waiter transition % -> %', o.status, _new_status;
  END IF;

  -- Chef strict transitions
  IF is_chef THEN
    IF o.status = 'preparing' AND _new_status = 'ready' THEN
      UPDATE public.orders SET status = 'ready', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Invalid chef transition % -> %', o.status, _new_status;
  END IF;

  RAISE EXCEPTION 'Not authorized';
END;
$function$;

-- 2) Helper: returns true if a table currently has any active (non paid/cancelled) order.
CREATE OR REPLACE FUNCTION public.table_is_occupied(_table_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE table_id = _table_id
      AND status NOT IN ('paid','cancelled')
  );
$function$;

-- 3) Helper RPC for staff tables board: returns each table the caller can see
--    (filtered to sections assigned to the waiter, or all tables if no scopes),
--    plus an `is_occupied` flag computed atomically server-side.
CREATE OR REPLACE FUNCTION public.get_my_waiter_tables()
 RETURNS TABLE(id uuid, label text, section_id uuid, qr_token text, is_occupied boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT s.id AS staff_id, s.cafeteria_ref_code
    FROM public.staff s
    WHERE s.user_id = auth.uid() AND s.is_active = true AND s.role = 'waiter'
    LIMIT 1
  ),
  my_sections AS (
    SELECT sc.ref_id FROM public.staff_scopes sc
    JOIN me ON me.staff_id = sc.staff_id
    WHERE sc.kind = 'section'
  ),
  has_scopes AS (SELECT EXISTS(SELECT 1 FROM my_sections) AS v)
  SELECT t.id, t.label, t.section_id, t.qr_token,
         public.table_is_occupied(t.id) AS is_occupied
  FROM public.restaurant_tables t, me, has_scopes
  WHERE t.cafeteria_ref_code = me.cafeteria_ref_code
    AND t.is_active = true
    AND (
      (NOT has_scopes.v)
      OR t.section_id IN (SELECT ref_id FROM my_sections)
    )
  ORDER BY t.label;
$function$;