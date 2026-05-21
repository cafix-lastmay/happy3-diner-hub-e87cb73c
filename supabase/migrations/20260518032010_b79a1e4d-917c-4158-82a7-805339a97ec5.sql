CREATE OR REPLACE FUNCTION public.notify_on_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cafe_name TEXT;
  cafe_admin_user UUID;
  table_title TEXT;
  waiter_row RECORD;
BEGIN
  SELECT name, user_id
    INTO cafe_name, cafe_admin_user
    FROM public.cafeterias
   WHERE ref_code = NEW.cafeteria_ref_code;

  table_title := CASE
    WHEN NEW.table_label IS NULL OR btrim(NEW.table_label) = '' THEN 'طلب جديد'
    WHEN NEW.table_label ~* '^\s*(table|طاولة)\b' THEN 'طلب جديد - ' || NEW.table_label
    ELSE 'طلب جديد - طاولة ' || NEW.table_label
  END;

  -- Notify cafeteria admin for every new order.
  IF cafe_admin_user IS NOT NULL THEN
    PERFORM public.create_notification(
      cafe_admin_user,
      'order.new.admin',
      table_title,
      'إجمالي: ' || NEW.total::text,
      jsonb_build_object(
        'order_id', NEW.id,
        'route', '/cafeteria/orders',
        'cafeteria_ref_code', NEW.cafeteria_ref_code,
        'table_label', NEW.table_label
      )
    );
  END IF;

  -- Notify assigned waiter when available; otherwise notify active on-duty waiters for this cafe.
  IF NEW.served_by IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.served_by,
      'order.new',
      table_title,
      'إجمالي: ' || NEW.total::text,
      jsonb_build_object(
        'order_id', NEW.id,
        'route', '/staff/orders',
        'cafeteria_ref_code', NEW.cafeteria_ref_code,
        'table_label', NEW.table_label
      )
    );
  ELSE
    FOR waiter_row IN
      SELECT DISTINCT sh.staff_user_id AS user_id
        FROM public.shifts sh
        JOIN public.staff s
          ON s.user_id = sh.staff_user_id
         AND s.cafeteria_ref_code = sh.cafeteria_ref_code
       WHERE sh.cafeteria_ref_code = NEW.cafeteria_ref_code
         AND sh.status = 'active'
         AND sh.staff_role = 'waiter'
         AND s.role = 'waiter'
         AND s.is_active = true
    LOOP
      PERFORM public.create_notification(
        waiter_row.user_id,
        'order.new',
        table_title,
        'إجمالي: ' || NEW.total::text,
        jsonb_build_object(
          'order_id', NEW.id,
          'route', '/staff/orders',
          'cafeteria_ref_code', NEW.cafeteria_ref_code,
          'table_label', NEW.table_label
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;