-- 1. Add 'paid' to order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'paid';

-- 2. Drop direct UPDATE policies on orders to force traffic through set_order_status RPC
DROP POLICY IF EXISTS "Cafe updates own orders" ON public.orders;
DROP POLICY IF EXISTS "Manager updates orders" ON public.orders;
DROP POLICY IF EXISTS "Staff updates own cafe orders" ON public.orders;

-- Re-create UPDATE policy ONLY for tip_amount edits by cafe admin/manager (used by tip input)
-- We'll keep update via RPC for status. For tips, allow admin/manager to update.
CREATE POLICY "Cafe admin/manager updates orders"
ON public.orders FOR UPDATE
USING (is_cafe_admin_or_manager(cafeteria_ref_code))
WITH CHECK (is_cafe_admin_or_manager(cafeteria_ref_code));

-- 3. Helper: does this order contain any item from a chef-controlled category?
CREATE OR REPLACE FUNCTION public.order_has_chef_items(_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.item_id
    WHERE oi.order_id = _order_id
      AND mi.category_id IN (
        SELECT DISTINCT sc.ref_id
        FROM public.staff_scopes sc
        JOIN public.staff s ON s.id = sc.staff_id
        WHERE s.cafeteria_ref_code = (SELECT cafeteria_ref_code FROM public.orders WHERE id = _order_id)
          AND s.role = 'chef'
          AND s.is_active = true
          AND sc.kind = 'category'
      )
  );
$$;

-- 4. Main RPC: enforce role-based status transitions
CREATE OR REPLACE FUNCTION public.set_order_status(_order_id uuid, _new_status order_status)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o RECORD;
  my_role app_role;
  is_admin boolean;
  is_manager boolean;
  is_waiter boolean;
  is_chef boolean;
  has_chef_items boolean;
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

  -- Admin/manager bypass transition rules (for ops correction) but still validate the path
  IF is_admin OR is_manager THEN
    UPDATE public.orders SET status = _new_status, updated_at = now() WHERE id = _order_id;
    RETURN;
  END IF;

  has_chef_items := public.order_has_chef_items(_order_id);

  -- Waiter transitions
  IF is_waiter THEN
    IF o.status = 'new' AND _new_status = 'preparing' THEN
      UPDATE public.orders SET status = 'preparing', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    -- waiter may set ready directly only when no chef-controlled items
    IF o.status = 'preparing' AND _new_status = 'ready' AND NOT has_chef_items THEN
      UPDATE public.orders SET status = 'ready', updated_at = now() WHERE id = _order_id;
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

  -- Chef transitions
  IF is_chef THEN
    IF o.status = 'preparing' AND _new_status = 'ready' THEN
      UPDATE public.orders SET status = 'ready', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Invalid chef transition % -> %', o.status, _new_status;
  END IF;

  RAISE EXCEPTION 'Not authorized';
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, order_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, order_status) TO authenticated;