
-- Phase 6: Driver Wallet + Ratings
CREATE TYPE public.wallet_settlement_status AS ENUM ('pending', 'paid');

CREATE TABLE public.driver_wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  order_id uuid NOT NULL UNIQUE,
  cafeteria_ref_code text NOT NULL,
  collected_from_customer numeric NOT NULL DEFAULT 0,
  delivery_fee_earned numeric NOT NULL DEFAULT 0,
  owed_to_cafeteria numeric NOT NULL DEFAULT 0,
  owed_to_driver numeric NOT NULL DEFAULT 0,
  settlement_status public.wallet_settlement_status NOT NULL DEFAULT 'pending',
  settled_at timestamptz,
  settled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dwe_driver ON public.driver_wallet_entries(driver_id);
CREATE INDEX idx_dwe_cafe ON public.driver_wallet_entries(cafeteria_ref_code);
CREATE INDEX idx_dwe_status ON public.driver_wallet_entries(settlement_status);

ALTER TABLE public.driver_wallet_entries ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_dwe_updated_at
  BEFORE UPDATE ON public.driver_wallet_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE POLICY "Driver views own wallet"
  ON public.driver_wallet_entries FOR SELECT
  USING (driver_id = public.get_my_driver_id());

CREATE POLICY "Cafe staff view wallet"
  ON public.driver_wallet_entries FOR SELECT
  USING (
    cafeteria_ref_code = public.get_my_cafeteria_ref_code()
    OR cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
    OR cafeteria_ref_code = public.get_my_staff_cafeteria_ref()
  );

CREATE POLICY "Owner views all wallet"
  ON public.driver_wallet_entries FOR SELECT
  USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE OR REPLACE FUNCTION public.create_wallet_entry_on_delivered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total numeric;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') AND NEW.driver_id IS NOT NULL THEN
    SELECT total INTO v_total FROM public.orders WHERE id = NEW.order_id;
    v_total := COALESCE(v_total, 0);
    INSERT INTO public.driver_wallet_entries (
      driver_id, order_id, cafeteria_ref_code,
      collected_from_customer, delivery_fee_earned, owed_to_cafeteria, owed_to_driver
    ) VALUES (
      NEW.driver_id, NEW.order_id, NEW.cafeteria_ref_code,
      v_total, COALESCE(NEW.fee_amount, 0),
      GREATEST(v_total - COALESCE(NEW.fee_amount, 0), 0),
      COALESCE(NEW.fee_amount, 0)
    ) ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_create_wallet_entry
  AFTER UPDATE ON public.delivery_details
  FOR EACH ROW EXECUTE FUNCTION public.create_wallet_entry_on_delivered();

-- ratings
CREATE TYPE public.rating_target_kind AS ENUM ('driver', 'cafeteria');

CREATE TABLE public.ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind public.rating_target_kind NOT NULL,
  target_ref text NOT NULL,
  order_id uuid NOT NULL,
  customer_phone text NOT NULL,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, target_kind)
);

CREATE INDEX idx_ratings_target ON public.ratings(target_kind, target_ref);
CREATE INDEX idx_ratings_order ON public.ratings(order_id);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cafe staff view own cafe ratings"
  ON public.ratings FOR SELECT
  USING (target_kind = 'cafeteria' AND (
    target_ref = public.get_my_cafeteria_ref_code()
    OR target_ref = public.get_my_manager_cafeteria_ref()
    OR target_ref = public.get_my_staff_cafeteria_ref()
  ));

CREATE POLICY "Driver views own ratings"
  ON public.ratings FOR SELECT
  USING (target_kind = 'driver' AND public.get_my_driver_id() IS NOT NULL AND target_ref = public.get_my_driver_id()::text);

CREATE POLICY "Owner views all ratings"
  ON public.ratings FOR SELECT
  USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE OR REPLACE FUNCTION public.recompute_driver_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_driver_id uuid;
BEGIN
  IF NEW.target_kind = 'driver' THEN
    BEGIN v_driver_id := NEW.target_ref::uuid;
    EXCEPTION WHEN OTHERS THEN RETURN NEW;
    END;
    UPDATE public.drivers d SET
      rating_count = (SELECT COUNT(*) FROM public.ratings r WHERE r.target_kind = 'driver' AND r.target_ref = v_driver_id::text),
      rating_avg   = COALESCE((SELECT AVG(stars)::numeric(4,2) FROM public.ratings r WHERE r.target_kind = 'driver' AND r.target_ref = v_driver_id::text), 0),
      updated_at   = now()
    WHERE d.id = v_driver_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_recompute_driver_rating
  AFTER INSERT ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.recompute_driver_rating();

-- RPCs
CREATE OR REPLACE FUNCTION public.get_my_driver_wallet()
RETURNS TABLE (
  id uuid, order_id uuid, short_code text,
  cafeteria_ref_code text, cafeteria_name text,
  collected_from_customer numeric, delivery_fee_earned numeric,
  owed_to_cafeteria numeric, owed_to_driver numeric,
  settlement_status text, settled_at timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.order_id, RIGHT(w.order_id::text, 6),
    w.cafeteria_ref_code, c.name,
    w.collected_from_customer, w.delivery_fee_earned,
    w.owed_to_cafeteria, w.owed_to_driver,
    w.settlement_status::text, w.settled_at, w.created_at
  FROM public.driver_wallet_entries w
  LEFT JOIN public.cafeterias c ON c.ref_code = w.cafeteria_ref_code
  WHERE w.driver_id = public.get_my_driver_id()
  ORDER BY w.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_cafe_driver_settlements()
RETURNS TABLE (
  driver_id uuid, driver_name text, driver_phone text, driver_photo text,
  pending_count integer, pending_owed_to_cafe numeric, pending_owed_to_driver numeric,
  paid_count integer, last_settled_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ref AS (
    SELECT COALESCE(public.get_my_cafeteria_ref_code(), public.get_my_manager_cafeteria_ref()) AS code
  )
  SELECT d.id, d.full_name, d.phone, d.photo_url,
    COALESCE(SUM(CASE WHEN w.settlement_status = 'pending' THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN w.settlement_status = 'pending' THEN w.owed_to_cafeteria ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN w.settlement_status = 'pending' THEN w.owed_to_driver    ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN w.settlement_status = 'paid'    THEN 1 ELSE 0 END), 0)::int,
    MAX(w.settled_at)
  FROM public.driver_wallet_entries w
  JOIN public.drivers d ON d.id = w.driver_id
  WHERE w.cafeteria_ref_code = (SELECT code FROM ref)
  GROUP BY d.id, d.full_name, d.phone, d.photo_url
  ORDER BY MAX(w.created_at) DESC;
$$;

CREATE OR REPLACE FUNCTION public.settle_driver_wallet(_driver_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_count integer;
BEGIN
  v_code := COALESCE(public.get_my_cafeteria_ref_code(), public.get_my_manager_cafeteria_ref());
  IF v_code IS NULL THEN RAISE EXCEPTION 'NOT_CAFE_ADMIN'; END IF;
  UPDATE public.driver_wallet_entries
  SET settlement_status = 'paid', settled_at = now(), settled_by = auth.uid()
  WHERE driver_id = _driver_id AND cafeteria_ref_code = v_code AND settlement_status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.notifications (user_id, kind, title, body, data)
  SELECT d.user_id, 'wallet_settled', 'تم تسوية المحفظة',
         'تم تسوية ' || v_count || ' عملية',
         jsonb_build_object('driver_id', _driver_id, 'cafeteria_ref_code', v_code, 'count', v_count)
  FROM public.drivers d WHERE d.id = _driver_id AND v_count > 0;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_delivery_rating(
  _order_id uuid, _customer_phone text,
  _driver_stars integer, _driver_comment text,
  _cafe_stars integer, _cafe_comment text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; v_status delivery_status; v_driver uuid; v_cafe text;
BEGIN
  SELECT customer_phone, status, driver_id, cafeteria_ref_code
    INTO v_phone, v_status, v_driver, v_cafe
  FROM public.delivery_details WHERE order_id = _order_id;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF regexp_replace(COALESCE(v_phone,''), '\D', '', 'g') <> regexp_replace(COALESCE(_customer_phone,''), '\D', '', 'g') THEN
    RAISE EXCEPTION 'PHONE_MISMATCH';
  END IF;
  IF v_status <> 'delivered' THEN RAISE EXCEPTION 'NOT_DELIVERED'; END IF;
  IF v_driver IS NOT NULL AND _driver_stars BETWEEN 1 AND 5 THEN
    INSERT INTO public.ratings (target_kind, target_ref, order_id, customer_phone, stars, comment)
    VALUES ('driver', v_driver::text, _order_id, _customer_phone, _driver_stars, NULLIF(_driver_comment,''))
    ON CONFLICT (order_id, target_kind) DO NOTHING;
  END IF;
  IF _cafe_stars BETWEEN 1 AND 5 THEN
    INSERT INTO public.ratings (target_kind, target_ref, order_id, customer_phone, stars, comment)
    VALUES ('cafeteria', v_cafe, _order_id, _customer_phone, _cafe_stars, NULLIF(_cafe_comment,''))
    ON CONFLICT (order_id, target_kind) DO NOTHING;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_delivery_rating_status(_order_id uuid)
RETURNS TABLE (driver_rated boolean, cafe_rated boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.ratings WHERE order_id = _order_id AND target_kind = 'driver'),
    EXISTS (SELECT 1 FROM public.ratings WHERE order_id = _order_id AND target_kind = 'cafeteria');
$$;

GRANT EXECUTE ON FUNCTION public.submit_delivery_rating(uuid, text, integer, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_rating_status(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_driver_wallet() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cafe_driver_settlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_driver_wallet(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_wallet_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ratings;
