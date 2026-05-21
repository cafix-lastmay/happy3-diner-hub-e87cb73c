
-- =========== Favorite drivers (cafeteria + customer) ===========
CREATE TABLE IF NOT EXISTS public.favorite_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  owner_kind text NOT NULL CHECK (owner_kind IN ('cafeteria','customer')),
  owner_ref text NOT NULL, -- cafeteria_ref_code OR normalized customer phone (digits only)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_kind, owner_ref, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_drivers_owner ON public.favorite_drivers (owner_kind, owner_ref);
CREATE INDEX IF NOT EXISTS idx_fav_drivers_driver ON public.favorite_drivers (driver_id);

ALTER TABLE public.favorite_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cafe views own favorites" ON public.favorite_drivers;
CREATE POLICY "Cafe views own favorites" ON public.favorite_drivers
FOR SELECT USING (
  owner_kind = 'cafeteria' AND owner_ref IN (
    SELECT COALESCE(get_my_cafeteria_ref_code(), get_my_manager_cafeteria_ref(), get_my_staff_cafeteria_ref())
  )
);

DROP POLICY IF EXISTS "Owner views all favorites" ON public.favorite_drivers;
CREATE POLICY "Owner views all favorites" ON public.favorite_drivers
FOR SELECT USING (has_role(auth.uid(), 'owner'::app_role));

-- inserts/updates/deletes go via RPCs only

-- =========== RPC: cafe toggle favorite ===========
CREATE OR REPLACE FUNCTION public.toggle_cafe_favorite_driver(_driver_id uuid, _favorite boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cafe text;
BEGIN
  v_cafe := COALESCE(get_my_cafeteria_ref_code(), get_my_manager_cafeteria_ref());
  IF v_cafe IS NULL THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF _favorite THEN
    INSERT INTO public.favorite_drivers (driver_id, owner_kind, owner_ref)
    VALUES (_driver_id, 'cafeteria', v_cafe)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.favorite_drivers
    WHERE driver_id = _driver_id AND owner_kind = 'cafeteria' AND owner_ref = v_cafe;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.toggle_cafe_favorite_driver(uuid, boolean) TO authenticated;

-- =========== RPC: customer toggle favorite ===========
-- Requires the customer to prove they ordered from this driver (delivered order with matching phone).
CREATE OR REPLACE FUNCTION public.toggle_customer_favorite_driver(
  _order_id uuid, _customer_phone text, _driver_id uuid, _favorite boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; v_status delivery_status; v_drv uuid; v_norm_in text; v_norm_db text;
BEGIN
  SELECT customer_phone, status, driver_id INTO v_phone, v_status, v_drv
  FROM public.delivery_details WHERE order_id = _order_id;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_status <> 'delivered' THEN RAISE EXCEPTION 'NOT_DELIVERED'; END IF;
  IF v_drv IS NULL OR v_drv <> _driver_id THEN RAISE EXCEPTION 'DRIVER_MISMATCH'; END IF;
  v_norm_in := regexp_replace(COALESCE(_customer_phone,''), '\D', '', 'g');
  v_norm_db := regexp_replace(COALESCE(v_phone,''), '\D', '', 'g');
  IF v_norm_in = '' OR v_norm_in <> v_norm_db THEN RAISE EXCEPTION 'PHONE_MISMATCH'; END IF;

  IF _favorite THEN
    INSERT INTO public.favorite_drivers (driver_id, owner_kind, owner_ref)
    VALUES (_driver_id, 'customer', v_norm_in)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.favorite_drivers
    WHERE driver_id = _driver_id AND owner_kind = 'customer' AND owner_ref = v_norm_in;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.toggle_customer_favorite_driver(uuid, text, uuid, boolean) TO anon, authenticated;

-- =========== RPC: customer favorite status ===========
CREATE OR REPLACE FUNCTION public.is_customer_favorite_driver(_customer_phone text, _driver_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.favorite_drivers
    WHERE owner_kind = 'customer'
      AND owner_ref = regexp_replace(COALESCE(_customer_phone,''), '\D', '', 'g')
      AND driver_id = _driver_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_customer_favorite_driver(text, uuid) TO anon, authenticated;

-- =========== Update available drivers list to surface favorites & sort ===========
DROP FUNCTION IF EXISTS public.list_available_drivers_for_cafeteria();
DROP FUNCTION IF EXISTS public.list_available_drivers_for_cafeteria(text);

CREATE OR REPLACE FUNCTION public.list_available_drivers_for_cafeteria(_customer_phone text DEFAULT NULL)
RETURNS TABLE(
  id uuid, full_name text, phone text, photo_url text, vehicle_type text,
  rating_avg numeric, status text, kind text,
  current_lat numeric, current_lng numeric,
  is_cafe_favorite boolean, is_customer_favorite boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE caller_cafe text; norm_phone text;
BEGIN
  caller_cafe := COALESCE(get_my_cafeteria_ref_code(), get_my_manager_cafeteria_ref(), get_my_staff_cafeteria_ref());
  IF caller_cafe IS NULL THEN RETURN; END IF;
  norm_phone := regexp_replace(COALESCE(_customer_phone,''), '\D', '', 'g');

  RETURN QUERY
  SELECT
    d.id, d.full_name, d.phone, d.photo_url, d.vehicle_type, d.rating_avg, d.status, d.kind,
    d.current_lat, d.current_lng,
    EXISTS (SELECT 1 FROM public.favorite_drivers f
            WHERE f.driver_id = d.id AND f.owner_kind = 'cafeteria' AND f.owner_ref = caller_cafe) AS is_cafe_favorite,
    (norm_phone <> '' AND EXISTS (
       SELECT 1 FROM public.favorite_drivers f
       WHERE f.driver_id = d.id AND f.owner_kind = 'customer' AND f.owner_ref = norm_phone
    )) AS is_customer_favorite
  FROM public.drivers d
  WHERE d.is_active = true
    AND ((d.kind = 'staff' AND d.cafeteria_ref_code = caller_cafe)
         OR EXISTS (SELECT 1 FROM public.driver_cafeteria_links l
                    WHERE l.driver_id = d.id AND l.cafeteria_ref_code = caller_cafe AND l.status = 'approved'))
  ORDER BY
    (d.status = 'available') DESC,
    -- favorites first: customer fav > cafe fav > others
    (CASE WHEN norm_phone <> '' AND EXISTS (SELECT 1 FROM public.favorite_drivers f
       WHERE f.driver_id = d.id AND f.owner_kind = 'customer' AND f.owner_ref = norm_phone) THEN 0 ELSE 1 END),
    (CASE WHEN EXISTS (SELECT 1 FROM public.favorite_drivers f
       WHERE f.driver_id = d.id AND f.owner_kind = 'cafeteria' AND f.owner_ref = caller_cafe) THEN 0 ELSE 1 END),
    d.rating_avg DESC NULLS LAST, d.full_name;
END $$;

GRANT EXECUTE ON FUNCTION public.list_available_drivers_for_cafeteria(text) TO authenticated;

-- =========== Bonus: complete the deferred BI + item-rating migration ===========
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS rating_avg numeric(4,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recompute_item_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item_id uuid;
BEGIN
  IF NEW.target_kind = 'menu_item' THEN
    BEGIN v_item_id := NEW.target_ref::uuid;
    EXCEPTION WHEN OTHERS THEN RETURN NEW;
    END;
    UPDATE public.menu_items mi SET
      rating_count = (SELECT COUNT(*) FROM public.ratings r WHERE r.target_kind = 'menu_item' AND r.target_ref = v_item_id::text),
      rating_avg   = COALESCE((SELECT AVG(stars)::numeric(4,2) FROM public.ratings r WHERE r.target_kind = 'menu_item' AND r.target_ref = v_item_id::text), 0),
      updated_at   = now()
    WHERE mi.id = v_item_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recompute_item_rating ON public.ratings;
CREATE TRIGGER trg_recompute_item_rating AFTER INSERT ON public.ratings
FOR EACH ROW EXECUTE FUNCTION public.recompute_item_rating();

DROP POLICY IF EXISTS "Cafe staff view own item ratings" ON public.ratings;
CREATE POLICY "Cafe staff view own item ratings" ON public.ratings
FOR SELECT USING (
  target_kind = 'menu_item' AND EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id::text = ratings.target_ref
      AND (mi.cafeteria_ref_code = get_my_cafeteria_ref_code()
           OR mi.cafeteria_ref_code = get_my_manager_cafeteria_ref()
           OR mi.cafeteria_ref_code = get_my_staff_cafeteria_ref())
  )
);

CREATE OR REPLACE FUNCTION public.submit_item_ratings(
  _order_id uuid, _customer_phone text, _ratings jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text; v_status delivery_status; v_cafe text; v_order_mode order_mode;
  v_norm_in text; v_norm_db text; r jsonb; v_item_id uuid; v_stars int; v_comment text;
BEGIN
  SELECT o.cafeteria_ref_code, o.mode INTO v_cafe, v_order_mode
  FROM public.orders o WHERE o.id = _order_id;
  IF v_cafe IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_order_mode = 'delivery' THEN
    SELECT customer_phone, status INTO v_phone, v_status
    FROM public.delivery_details WHERE order_id = _order_id;
    IF v_phone IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_status <> 'delivered' THEN RAISE EXCEPTION 'NOT_DELIVERED'; END IF;
    v_norm_in := regexp_replace(COALESCE(_customer_phone,''), '\D', '', 'g');
    v_norm_db := regexp_replace(COALESCE(v_phone,''), '\D', '', 'g');
    IF v_norm_in <> v_norm_db THEN RAISE EXCEPTION 'PHONE_MISMATCH'; END IF;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_ratings, '[]'::jsonb))
  LOOP
    v_item_id := (r->>'item_id')::uuid;
    v_stars := COALESCE((r->>'stars')::int, 0);
    v_comment := NULLIF(r->>'comment', '');
    IF v_stars NOT BETWEEN 1 AND 5 THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = _order_id AND oi.item_id = v_item_id) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.ratings (target_kind, target_ref, order_id, customer_phone, stars, comment)
    VALUES ('menu_item', v_item_id::text, _order_id, _customer_phone, v_stars, v_comment)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.submit_item_ratings(uuid, text, jsonb) TO anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS ratings_unique_per_order_item
  ON public.ratings (order_id, target_ref)
  WHERE target_kind = 'menu_item';

-- BI report RPCs
CREATE OR REPLACE FUNCTION public.get_cafe_sales_timeseries(_days int DEFAULT 30)
RETURNS TABLE(day date, orders_count bigint, revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cafe text;
BEGIN
  v_cafe := COALESCE(get_my_cafeteria_ref_code(), get_my_manager_cafeteria_ref(), get_my_staff_cafeteria_ref());
  IF v_cafe IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT d::date AS day,
         COUNT(o.id)::bigint AS orders_count,
         COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total ELSE 0 END), 0)::numeric AS revenue
  FROM generate_series(now()::date - (_days - 1), now()::date, '1 day'::interval) d
  LEFT JOIN public.orders o
    ON o.cafeteria_ref_code = v_cafe
   AND o.created_at::date = d::date
   AND o.status <> 'cancelled'
  GROUP BY d ORDER BY d;
END $$;

CREATE OR REPLACE FUNCTION public.get_cafe_top_items(_days int DEFAULT 30, _limit int DEFAULT 10)
RETURNS TABLE(item_name text, qty bigint, revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cafe text;
BEGIN
  v_cafe := COALESCE(get_my_cafeteria_ref_code(), get_my_manager_cafeteria_ref(), get_my_staff_cafeteria_ref());
  IF v_cafe IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT oi.name_snapshot AS item_name,
         SUM(oi.qty)::bigint AS qty,
         SUM(oi.qty * oi.price_snapshot)::numeric AS revenue
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.cafeteria_ref_code = v_cafe
    AND o.created_at >= now() - make_interval(days => _days)
    AND o.status <> 'cancelled'
  GROUP BY oi.name_snapshot
  ORDER BY qty DESC LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.get_cafe_orders_by_mode(_days int DEFAULT 30)
RETURNS TABLE(mode text, orders_count bigint, revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cafe text;
BEGIN
  v_cafe := COALESCE(get_my_cafeteria_ref_code(), get_my_manager_cafeteria_ref(), get_my_staff_cafeteria_ref());
  IF v_cafe IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT o.mode::text,
         COUNT(*)::bigint,
         COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.total ELSE 0 END), 0)::numeric
  FROM public.orders o
  WHERE o.cafeteria_ref_code = v_cafe
    AND o.created_at >= now() - make_interval(days => _days)
    AND o.status <> 'cancelled'
  GROUP BY o.mode;
END $$;

CREATE OR REPLACE FUNCTION public.get_cafe_peak_hours(_days int DEFAULT 30)
RETURNS TABLE(hour int, orders_count bigint, revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cafe text;
BEGIN
  v_cafe := COALESCE(get_my_cafeteria_ref_code(), get_my_manager_cafeteria_ref(), get_my_staff_cafeteria_ref());
  IF v_cafe IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT h.hour::int,
         COALESCE(COUNT(o.id),0)::bigint,
         COALESCE(SUM(CASE WHEN o.status='paid' THEN o.total ELSE 0 END),0)::numeric
  FROM generate_series(0,23) AS h(hour)
  LEFT JOIN public.orders o
    ON o.cafeteria_ref_code = v_cafe
   AND EXTRACT(hour FROM o.created_at) = h.hour
   AND o.created_at >= now() - make_interval(days => _days)
   AND o.status <> 'cancelled'
  GROUP BY h.hour ORDER BY h.hour;
END $$;

GRANT EXECUTE ON FUNCTION public.get_cafe_sales_timeseries(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cafe_top_items(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cafe_orders_by_mode(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cafe_peak_hours(int) TO authenticated;
