
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('independent','staff')),
  cafeteria_ref_code text REFERENCES public.cafeterias(ref_code) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text,
  vehicle_type text,
  photo_url text,
  service_radius_km numeric NOT NULL DEFAULT 5,
  home_lat numeric,
  home_lng numeric,
  current_lat numeric,
  current_lng numeric,
  last_location_at timestamptz,
  status text NOT NULL DEFAULT 'unavailable' CHECK (status IN ('available','busy','unavailable')),
  rating_avg numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_cafeteria ON public.drivers(cafeteria_ref_code);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers(status);

CREATE TABLE IF NOT EXISTS public.driver_cafeteria_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  cafeteria_ref_code text NOT NULL REFERENCES public.cafeterias(ref_code) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  UNIQUE (driver_id, cafeteria_ref_code)
);

CREATE INDEX IF NOT EXISTS idx_dcl_cafeteria ON public.driver_cafeteria_links(cafeteria_ref_code, status);
CREATE INDEX IF NOT EXISTS idx_dcl_driver ON public.driver_cafeteria_links(driver_id, status);

CREATE TRIGGER drivers_set_updated_at BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.get_my_driver_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_my_driver_id() TO authenticated;

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_cafeteria_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver views self" ON public.drivers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Driver updates self" ON public.drivers
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Driver inserts self" ON public.drivers
  FOR INSERT WITH CHECK (auth.uid() = user_id AND kind = 'independent');

CREATE POLICY "Owner manages drivers" ON public.drivers
  FOR ALL USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Cafe admin views own drivers" ON public.drivers
  FOR SELECT USING (
    (kind = 'staff' AND cafeteria_ref_code = get_my_cafeteria_ref_code())
    OR EXISTS (
      SELECT 1 FROM public.driver_cafeteria_links l
      WHERE l.driver_id = drivers.id
        AND l.cafeteria_ref_code = get_my_cafeteria_ref_code()
    )
  );

CREATE POLICY "Manager views own drivers" ON public.drivers
  FOR SELECT USING (
    (kind = 'staff' AND cafeteria_ref_code = get_my_manager_cafeteria_ref())
    OR EXISTS (
      SELECT 1 FROM public.driver_cafeteria_links l
      WHERE l.driver_id = drivers.id
        AND l.cafeteria_ref_code = get_my_manager_cafeteria_ref()
    )
  );

CREATE POLICY "Cafe admin manages staff drivers" ON public.drivers
  FOR ALL USING (kind = 'staff' AND cafeteria_ref_code = get_my_cafeteria_ref_code())
  WITH CHECK (kind = 'staff' AND cafeteria_ref_code = get_my_cafeteria_ref_code());

CREATE POLICY "Driver views own links" ON public.driver_cafeteria_links
  FOR SELECT USING (driver_id = get_my_driver_id());

CREATE POLICY "Driver inserts own pending link" ON public.driver_cafeteria_links
  FOR INSERT WITH CHECK (driver_id = get_my_driver_id() AND status = 'pending');

CREATE POLICY "Driver deletes own pending link" ON public.driver_cafeteria_links
  FOR DELETE USING (driver_id = get_my_driver_id() AND status = 'pending');

CREATE POLICY "Cafe admin views own cafeteria links" ON public.driver_cafeteria_links
  FOR SELECT USING (cafeteria_ref_code = get_my_cafeteria_ref_code());

CREATE POLICY "Manager views own cafeteria links" ON public.driver_cafeteria_links
  FOR SELECT USING (cafeteria_ref_code = get_my_manager_cafeteria_ref());

CREATE POLICY "Cafe admin updates own cafeteria links" ON public.driver_cafeteria_links
  FOR UPDATE USING (cafeteria_ref_code = get_my_cafeteria_ref_code())
  WITH CHECK (cafeteria_ref_code = get_my_cafeteria_ref_code());

CREATE POLICY "Manager updates own cafeteria links" ON public.driver_cafeteria_links
  FOR UPDATE USING (cafeteria_ref_code = get_my_manager_cafeteria_ref())
  WITH CHECK (cafeteria_ref_code = get_my_manager_cafeteria_ref());

CREATE POLICY "Owner manages all links" ON public.driver_cafeteria_links
  FOR ALL USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

-- Notify cafeteria admin when a driver requests to join
CREATE OR REPLACE FUNCTION public.notify_driver_join_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_user_id uuid;
  driver_name text;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT user_id INTO admin_user_id FROM public.cafeterias WHERE ref_code = NEW.cafeteria_ref_code;
    SELECT full_name INTO driver_name FROM public.drivers WHERE id = NEW.driver_id;
    IF admin_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, kind, title, body, data)
      VALUES (
        admin_user_id,
        'driver_join_request',
        'طلب انضمام سائق',
        COALESCE(driver_name, 'سائق') || ' يطلب الانضمام للكافيتيريا',
        jsonb_build_object('driver_id', NEW.driver_id, 'link_id', NEW.id, 'cafeteria_ref_code', NEW.cafeteria_ref_code)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_driver_join_request
  AFTER INSERT ON public.driver_cafeteria_links
  FOR EACH ROW EXECUTE FUNCTION public.notify_driver_join_request();

CREATE OR REPLACE FUNCTION public.notify_driver_join_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  driver_user_id uuid;
  cafe_name text;
BEGIN
  IF NEW.status IN ('approved','rejected') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT user_id INTO driver_user_id FROM public.drivers WHERE id = NEW.driver_id;
    SELECT name INTO cafe_name FROM public.cafeterias WHERE ref_code = NEW.cafeteria_ref_code;
    IF driver_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, kind, title, body, data)
      VALUES (
        driver_user_id,
        'driver_join_' || NEW.status,
        CASE WHEN NEW.status = 'approved' THEN 'تمت الموافقة على طلبك' ELSE 'تم رفض طلبك' END,
        COALESCE(cafe_name, 'الكافيتيريا') ||
          CASE WHEN NEW.status = 'approved' THEN ' وافقت على انضمامك' ELSE ' رفضت طلبك' END,
        jsonb_build_object('driver_id', NEW.driver_id, 'link_id', NEW.id, 'cafeteria_ref_code', NEW.cafeteria_ref_code, 'status', NEW.status)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_driver_join_decision
  AFTER UPDATE ON public.driver_cafeteria_links
  FOR EACH ROW EXECUTE FUNCTION public.notify_driver_join_decision();

-- Helper to enforce service radius cap (read app_settings.max_driver_radius_km)
CREATE OR REPLACE FUNCTION public.cap_driver_radius()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE max_km integer;
BEGIN
  SELECT max_driver_radius_km INTO max_km FROM public.app_settings WHERE id = true LIMIT 1;
  IF max_km IS NOT NULL AND NEW.service_radius_km > max_km THEN
    NEW.service_radius_km := max_km;
  END IF;
  IF NEW.service_radius_km < 1 THEN NEW.service_radius_km := 1; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER drivers_cap_radius BEFORE INSERT OR UPDATE OF service_radius_km ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.cap_driver_radius();
