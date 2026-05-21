
-- Enable pg_net for calling edge functions from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============ PUSH TOKENS ============
CREATE TABLE public.push_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android','ios','web')),
  device_info JSONB,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token)
);
CREATE INDEX idx_push_tokens_user ON public.push_tokens(user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User manages own push tokens" ON public.push_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner views all push tokens" ON public.push_tokens
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'));

-- ============ NOTIFICATIONS (in-app center) ============
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User views own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "User updates own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "User deletes own notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Owner views all notifications" ON public.notifications
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'));

-- enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ============ NOTIFICATION PREFERENCES ============
CREATE TABLE public.notification_preferences (
  user_id UUID NOT NULL PRIMARY KEY,
  new_orders BOOLEAN NOT NULL DEFAULT true,
  service_calls BOOLEAN NOT NULL DEFAULT true,
  shifts BOOLEAN NOT NULL DEFAULT true,
  recharge_withdrawal BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User manages own prefs" ON public.notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner views all prefs" ON public.notification_preferences
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'));

-- ============ HELPER: insert notification + dispatch push ============
CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id UUID, _kind TEXT, _title TEXT, _body TEXT, _data JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_id UUID;
  pref RECORD;
  allow BOOLEAN := true;
  proj_url TEXT;
  service_key TEXT;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO pref FROM public.notification_preferences WHERE user_id = _user_id;
  IF FOUND THEN
    IF _kind LIKE 'order.%' AND NOT pref.new_orders THEN allow := false; END IF;
    IF _kind LIKE 'service.%' AND NOT pref.service_calls THEN allow := false; END IF;
    IF _kind LIKE 'shift.%' AND NOT pref.shifts THEN allow := false; END IF;
    IF _kind IN ('recharge.approved','recharge.rejected','withdrawal.paid','withdrawal.rejected') AND NOT pref.recharge_withdrawal THEN allow := false; END IF;
  END IF;
  IF NOT allow THEN RETURN NULL; END IF;

  INSERT INTO public.notifications(user_id, kind, title, body, data)
  VALUES (_user_id, _kind, _title, _body, COALESCE(_data,'{}'::jsonb))
  RETURNING id INTO new_id;

  -- Dispatch native push asynchronously via edge function
  BEGIN
    SELECT decrypted_secret INTO proj_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    IF proj_url IS NOT NULL AND service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := proj_url || '/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),
        body := jsonb_build_object('user_id',_user_id,'title',_title,'body',_body,'data',COALESCE(_data,'{}'::jsonb),'kind',_kind)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN new_id;
END $$;

-- ============ TRIGGER: new order -> notify waiter/chef ============
CREATE OR REPLACE FUNCTION public.notify_on_new_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st RECORD;
  cafe_name TEXT;
BEGIN
  SELECT name INTO cafe_name FROM public.cafeterias WHERE ref_code = NEW.cafeteria_ref_code;
  -- Notify assigned waiter
  IF NEW.served_by IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.served_by, 'order.new',
      'طلب جديد - ' || COALESCE(NEW.table_label,''),
      'إجمالي: ' || NEW.total::text,
      jsonb_build_object('order_id', NEW.id, 'route', '/staff/orders')
    );
  END IF;
  -- Notify chefs whose categories appear in the order
  FOR st IN
    SELECT DISTINCT s.user_id FROM public.staff s
    JOIN public.staff_scopes sc ON sc.staff_id = s.id AND sc.kind = 'category'
    JOIN public.menu_items mi ON mi.category_id = sc.ref_id
    JOIN public.order_items oi ON oi.item_id = mi.id
    WHERE oi.order_id = NEW.id AND s.role = 'chef' AND s.is_active = true
      AND s.cafeteria_ref_code = NEW.cafeteria_ref_code
  LOOP
    PERFORM public.create_notification(
      st.user_id, 'order.new.chef',
      'طلب جديد للمطبخ',
      COALESCE(NEW.table_label,'') || ' - ' || COALESCE(cafe_name,''),
      jsonb_build_object('order_id', NEW.id, 'route', '/staff/orders')
    );
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_on_new_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_order();

-- ============ TRIGGER: shift status change ============
CREATE OR REPLACE FUNCTION public.notify_on_shift_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'active' AND OLD.status = 'pending' THEN
    PERFORM public.create_notification(NEW.staff_user_id, 'shift.approved',
      'تم اعتماد الشفت', 'يمكنك بدء العمل الآن',
      jsonb_build_object('shift_id', NEW.id, 'route', '/staff/orders'));
  ELSIF NEW.status = 'rejected' THEN
    PERFORM public.create_notification(NEW.staff_user_id, 'shift.rejected',
      'تم رفض طلب الشفت', COALESCE(NEW.notes,''),
      jsonb_build_object('shift_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_on_shift_change
AFTER UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_shift_change();

-- ============ TRIGGER: recharge approved/rejected ============
CREATE OR REPLACE FUNCTION public.notify_on_recharge_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cafe_user UUID;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  SELECT user_id INTO cafe_user FROM public.cafeterias WHERE ref_code = NEW.cafeteria_ref_code;
  IF cafe_user IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'approved' THEN
    PERFORM public.create_notification(cafe_user, 'recharge.approved',
      'تم اعتماد الشحن',
      'تمت إضافة ' || NEW.points_to_credit::text || ' نقطة',
      jsonb_build_object('recharge_id', NEW.id, 'route', '/cafeteria/recharge'));
  ELSIF NEW.status = 'rejected' THEN
    PERFORM public.create_notification(cafe_user, 'recharge.rejected',
      'تم رفض طلب الشحن', COALESCE(NEW.notes,''),
      jsonb_build_object('recharge_id', NEW.id, 'route', '/cafeteria/recharge'));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_on_recharge_change
AFTER UPDATE ON public.recharge_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_recharge_change();

-- ============ TRIGGER: withdrawal status change ============
CREATE OR REPLACE FUNCTION public.notify_on_withdrawal_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m_user UUID;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  SELECT user_id INTO m_user FROM public.marketers WHERE ref_code = NEW.marketer_ref_code;
  IF m_user IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'paid' THEN
    PERFORM public.create_notification(m_user, 'withdrawal.paid',
      'تم تحويل السحب',
      'مبلغ ' || NEW.amount_usd::text || ' USD',
      jsonb_build_object('withdrawal_id', NEW.id, 'route', '/marketer/withdrawals'));
  ELSIF NEW.status = 'rejected' THEN
    PERFORM public.create_notification(m_user, 'withdrawal.rejected',
      'تم رفض طلب السحب', COALESCE(NEW.notes,''),
      jsonb_build_object('withdrawal_id', NEW.id, 'route', '/marketer/withdrawals'));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_on_withdrawal_change
AFTER UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_on_withdrawal_change();
