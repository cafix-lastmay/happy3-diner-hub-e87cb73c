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

  -- Notify assigned/on-duty waiter when the order has been matched to a shift.
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
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_chef_on_new_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row RECORD;
  chef_row RECORD;
  cafe_name TEXT;
BEGIN
  SELECT * INTO order_row
    FROM public.orders
   WHERE id = NEW.order_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT name INTO cafe_name
    FROM public.cafeterias
   WHERE ref_code = order_row.cafeteria_ref_code;

  FOR chef_row IN
    SELECT DISTINCT s.user_id
      FROM public.staff s
      JOIN public.staff_scopes sc
        ON sc.staff_id = s.id
       AND sc.kind = 'category'
      JOIN public.menu_items mi
        ON mi.id = NEW.item_id
       AND mi.category_id = sc.ref_id
     WHERE s.role = 'chef'
       AND s.is_active = true
       AND s.cafeteria_ref_code = order_row.cafeteria_ref_code
       AND s.user_id IS NOT NULL
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.notifications n
       WHERE n.user_id = chef_row.user_id
         AND n.kind = 'order.new.chef'
         AND n.data->>'order_id' = order_row.id::text
    ) THEN
      PERFORM public.create_notification(
        chef_row.user_id,
        'order.new.chef',
        'طلب جديد للمطبخ',
        COALESCE(order_row.table_label, '') || ' - ' || COALESCE(cafe_name, ''),
        jsonb_build_object(
          'order_id', order_row.id,
          'route', '/staff/orders',
          'cafeteria_ref_code', order_row.cafeteria_ref_code,
          'table_label', order_row.table_label
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chef_on_new_order_item ON public.order_items;
CREATE TRIGGER trg_notify_chef_on_new_order_item
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.notify_chef_on_new_order_item();