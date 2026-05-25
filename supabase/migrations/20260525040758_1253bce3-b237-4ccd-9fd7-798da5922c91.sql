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
  needs_chef boolean;
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

  IF (is_waiter OR is_chef) THEN
    SELECT EXISTS(SELECT 1 FROM public.shifts WHERE staff_user_id = auth.uid() AND status = 'active')
      INTO has_active_shift;
    IF NOT has_active_shift THEN RAISE EXCEPTION 'Active shift required'; END IF;
  END IF;

  IF _new_status = 'cancelled' THEN
    IF NOT (is_admin OR is_manager OR is_waiter) THEN RAISE EXCEPTION 'Not allowed to cancel'; END IF;
    IF o.status NOT IN ('new','preparing','awaiting_payment','paid_at_counter') THEN RAISE EXCEPTION 'Cannot cancel in this status'; END IF;
    UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = _order_id;
    RETURN;
  END IF;

  IF is_admin OR is_manager THEN
    UPDATE public.orders SET status = _new_status, updated_at = now() WHERE id = _order_id;
    RETURN;
  END IF;

  IF is_waiter THEN
    IF o.status = 'awaiting_payment' AND _new_status = 'paid_at_counter' THEN
      UPDATE public.orders SET status = 'paid_at_counter', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'new' AND _new_status = 'preparing' THEN
      UPDATE public.orders SET status = 'preparing', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'preparing' AND _new_status = 'ready' THEN
      -- Chef-required rule only applies to dine_in orders. For takeaway/delivery
      -- the waiter (or any staff) can mark ready since there is no table service.
      IF o.mode = 'dine_in' THEN
        needs_chef := public.order_requires_chef(_order_id);
        IF needs_chef THEN
          RAISE EXCEPTION 'CHEF_REQUIRED: this order has chef items, only chef can mark ready';
        END IF;
      END IF;
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

  IF is_chef THEN
    IF o.status = 'paid_at_counter' AND _new_status = 'preparing' THEN
      UPDATE public.orders SET status = 'preparing', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    IF o.status = 'preparing' AND _new_status = 'ready' THEN
      UPDATE public.orders SET status = 'ready', updated_at = now() WHERE id = _order_id;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Invalid chef transition % -> %', o.status, _new_status;
  END IF;

  RAISE EXCEPTION 'Not authorized';
END;
$function$;