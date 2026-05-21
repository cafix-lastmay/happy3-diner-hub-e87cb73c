
ALTER TABLE public.cafeterias
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric;

-- Haversine distance in km
CREATE OR REPLACE FUNCTION public._haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT (2 * 6371 * asin(sqrt(
    sin(radians((lat2 - lat1) / 2)) ^ 2
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians((lng2 - lng1) / 2)) ^ 2
  )))::numeric;
$$;

CREATE OR REPLACE FUNCTION public.get_nearby_cafeterias_for_driver()
RETURNS TABLE (
  cafeteria_id uuid,
  ref_code text,
  name text,
  address text,
  lat numeric,
  lng numeric,
  distance_km numeric,
  link_status text,
  link_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d_id uuid;
  d_lat numeric;
  d_lng numeric;
  d_radius numeric;
BEGIN
  SELECT id, COALESCE(current_lat, home_lat), COALESCE(current_lng, home_lng), service_radius_km
    INTO d_id, d_lat, d_lng, d_radius
  FROM public.drivers WHERE user_id = auth.uid();

  IF d_id IS NULL OR d_lat IS NULL OR d_lng IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.ref_code, c.name, c.address, c.lat, c.lng,
         public._haversine_km(d_lat, d_lng, c.lat, c.lng) AS distance_km,
         COALESCE(l.status, 'none') AS link_status,
         l.id AS link_id
  FROM public.cafeterias c
  LEFT JOIN public.driver_cafeteria_links l
    ON l.cafeteria_ref_code = c.ref_code AND l.driver_id = d_id
  WHERE c.is_active = true
    AND c.lat IS NOT NULL AND c.lng IS NOT NULL
    AND public._haversine_km(d_lat, d_lng, c.lat, c.lng) <= d_radius
  ORDER BY distance_km ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_request_join(_cafeteria_ref_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d_id uuid;
  new_id uuid;
BEGIN
  SELECT id INTO d_id FROM public.drivers WHERE user_id = auth.uid() AND kind = 'independent';
  IF d_id IS NULL THEN RAISE EXCEPTION 'NOT_INDEPENDENT_DRIVER'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cafeterias WHERE ref_code = _cafeteria_ref_code AND is_active = true) THEN
    RAISE EXCEPTION 'CAFETERIA_NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM public.driver_cafeteria_links WHERE driver_id = d_id AND cafeteria_ref_code = _cafeteria_ref_code AND status IN ('pending','approved')) THEN
    RAISE EXCEPTION 'LINK_EXISTS';
  END IF;
  INSERT INTO public.driver_cafeteria_links (driver_id, cafeteria_ref_code, status)
  VALUES (d_id, _cafeteria_ref_code, 'pending')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_cancel_join_request(_link_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE d_id uuid;
BEGIN
  SELECT id INTO d_id FROM public.drivers WHERE user_id = auth.uid();
  IF d_id IS NULL THEN RAISE EXCEPTION 'NOT_DRIVER'; END IF;
  DELETE FROM public.driver_cafeteria_links WHERE id = _link_id AND driver_id = d_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_driver_location(_lat numeric, _lng numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.drivers
    SET current_lat = _lat, current_lng = _lng, last_location_at = now()
    WHERE user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_driver_join_request(_link_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cafe_ref text;
BEGIN
  SELECT cafeteria_ref_code INTO cafe_ref FROM public.driver_cafeteria_links WHERE id = _link_id;
  IF cafe_ref IS NULL THEN RAISE EXCEPTION 'LINK_NOT_FOUND'; END IF;
  IF cafe_ref <> COALESCE(public.get_my_cafeteria_ref_code(), public.get_my_manager_cafeteria_ref()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.driver_cafeteria_links
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        decided_at = now(),
        decided_by = auth.uid()
    WHERE id = _link_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cafe_drivers_panel()
RETURNS TABLE (
  scope text,
  link_id uuid,
  driver_id uuid,
  full_name text,
  phone text,
  vehicle_type text,
  photo_url text,
  status text,
  rating_avg numeric,
  kind text,
  link_status text,
  requested_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cafe_ref text := COALESCE(public.get_my_cafeteria_ref_code(), public.get_my_manager_cafeteria_ref());
BEGIN
  IF cafe_ref IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT 'staff'::text, NULL::uuid, d.id, d.full_name, d.phone, d.vehicle_type, d.photo_url,
         d.status, d.rating_avg, d.kind, NULL::text, NULL::timestamptz
  FROM public.drivers d
  WHERE d.kind = 'staff' AND d.cafeteria_ref_code = cafe_ref AND d.is_active = true
  UNION ALL
  SELECT 'independent'::text, l.id, d.id, d.full_name, d.phone, d.vehicle_type, d.photo_url,
         d.status, d.rating_avg, d.kind, l.status, l.requested_at
  FROM public.driver_cafeteria_links l
  JOIN public.drivers d ON d.id = l.driver_id
  WHERE l.cafeteria_ref_code = cafe_ref;
END;
$$;
