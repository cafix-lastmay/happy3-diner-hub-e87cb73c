
-- 1. Audit table for manual owner adjustments
CREATE TABLE IF NOT EXISTS public.owner_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('cafeteria_points','marketer_available','marketer_frozen')),
  target_ref_code text NOT NULL,
  delta numeric NOT NULL,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages adjustments"
ON public.owner_adjustments FOR ALL
USING (public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- 2. Owner: manually adjust cafeteria points
CREATE OR REPLACE FUNCTION public.owner_adjust_cafeteria_points(_ref_code text, _delta numeric, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Only owner can adjust balances';
  END IF;

  SELECT points_balance INTO current_balance FROM public.cafeterias WHERE ref_code = _ref_code;
  IF current_balance IS NULL THEN RAISE EXCEPTION 'Cafeteria not found'; END IF;
  IF current_balance + _delta < 0 THEN RAISE EXCEPTION 'Adjustment would make balance negative'; END IF;

  UPDATE public.cafeterias SET points_balance = points_balance + _delta, updated_at = now() WHERE ref_code = _ref_code;

  INSERT INTO public.owner_adjustments(owner_user_id, target_kind, target_ref_code, delta, reason)
  VALUES (auth.uid(), 'cafeteria_points', _ref_code, _delta, _reason);
END;
$$;

-- 3. Owner: adjust marketer balance (available or frozen)
CREATE OR REPLACE FUNCTION public.owner_adjust_marketer_balance(_ref_code text, _kind text, _delta numeric, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_avail numeric; cur_frozen numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only owner'; END IF;
  IF _kind NOT IN ('available','frozen') THEN RAISE EXCEPTION 'Invalid kind'; END IF;

  SELECT commission_balance_available, commission_balance_frozen INTO cur_avail, cur_frozen FROM public.marketers WHERE ref_code = _ref_code;
  IF cur_avail IS NULL THEN RAISE EXCEPTION 'Marketer not found'; END IF;

  IF _kind = 'available' THEN
    IF cur_avail + _delta < 0 THEN RAISE EXCEPTION 'Negative balance'; END IF;
    UPDATE public.marketers SET commission_balance_available = commission_balance_available + _delta, updated_at = now() WHERE ref_code = _ref_code;
    INSERT INTO public.owner_adjustments(owner_user_id, target_kind, target_ref_code, delta, reason) VALUES (auth.uid(), 'marketer_available', _ref_code, _delta, _reason);
  ELSE
    IF cur_frozen + _delta < 0 THEN RAISE EXCEPTION 'Negative balance'; END IF;
    UPDATE public.marketers SET commission_balance_frozen = commission_balance_frozen + _delta, updated_at = now() WHERE ref_code = _ref_code;
    INSERT INTO public.owner_adjustments(owner_user_id, target_kind, target_ref_code, delta, reason) VALUES (auth.uid(), 'marketer_frozen', _ref_code, _delta, _reason);
  END IF;
END;
$$;

-- 4. Owner stats (KPIs)
CREATE OR REPLACE FUNCTION public.owner_get_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Only owner'; END IF;
  SELECT jsonb_build_object(
    'marketers_total',     (SELECT COUNT(*) FROM public.marketers),
    'marketers_active',    (SELECT COUNT(*) FROM public.marketers WHERE is_active),
    'cafeterias_total',    (SELECT COUNT(*) FROM public.cafeterias),
    'cafeterias_active',   (SELECT COUNT(*) FROM public.cafeterias WHERE is_active),
    'recharges_pending',   (SELECT COUNT(*) FROM public.recharge_requests WHERE status='pending'),
    'recharges_approved_total_usd', (SELECT COALESCE(SUM(amount_usd),0) FROM public.recharge_requests WHERE status='approved'),
    'recharges_pending_total_usd',  (SELECT COALESCE(SUM(amount_usd),0) FROM public.recharge_requests WHERE status='pending'),
    'commissions_paid_usd',     (SELECT COALESCE(SUM(amount_usd),0) FROM public.commission_transactions WHERE status IN ('available','withdrawn')),
    'commissions_frozen_usd',   (SELECT COALESCE(SUM(amount_usd),0) FROM public.commission_transactions WHERE status='frozen'),
    'withdrawals_pending',      (SELECT COUNT(*) FROM public.withdrawal_requests WHERE status='pending'),
    'withdrawals_paid_usd',     (SELECT COALESCE(SUM(amount_usd),0) FROM public.withdrawal_requests WHERE status='paid'),
    'cafeteria_points_total',   (SELECT COALESCE(SUM(points_balance),0) FROM public.cafeterias),
    'orders_total',             (SELECT COUNT(*) FROM public.orders),
    'orders_total_value',       (SELECT COALESCE(SUM(total),0) FROM public.orders WHERE status <> 'cancelled')
  ) INTO r;
  RETURN r;
END; $$;

-- 5. Top performers
CREATE OR REPLACE FUNCTION public.owner_top_cafeterias(_days int DEFAULT 30, _limit int DEFAULT 10)
RETURNS TABLE(ref_code text, name text, total_recharged numeric, recharge_count bigint, points_balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.ref_code, c.name,
         COALESCE(SUM(r.amount_usd) FILTER (WHERE r.status='approved' AND r.approved_at > now() - (_days || ' days')::interval), 0) AS total_recharged,
         COUNT(r.id) FILTER (WHERE r.status='approved' AND r.approved_at > now() - (_days || ' days')::interval) AS recharge_count,
         c.points_balance
  FROM public.cafeterias c
  LEFT JOIN public.recharge_requests r ON r.cafeteria_ref_code = c.ref_code
  WHERE public.has_role(auth.uid(),'owner')
  GROUP BY c.ref_code, c.name, c.points_balance
  ORDER BY total_recharged DESC
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.owner_top_marketers(_days int DEFAULT 30, _limit int DEFAULT 10)
RETURNS TABLE(ref_code text, name text, level int, total_commission numeric, available_balance numeric, cafeterias_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.ref_code, m.name, m.level,
         COALESCE(SUM(ct.amount_usd) FILTER (WHERE ct.created_at > now() - (_days || ' days')::interval), 0) AS total_commission,
         m.commission_balance_available,
         (SELECT COUNT(*) FROM public.cafeterias c WHERE c.parent_ref_code = m.ref_code) AS cafeterias_count
  FROM public.marketers m
  LEFT JOIN public.commission_transactions ct ON ct.marketer_ref_code = m.ref_code
  WHERE public.has_role(auth.uid(),'owner')
  GROUP BY m.ref_code, m.name, m.level, m.commission_balance_available
  ORDER BY total_commission DESC
  LIMIT _limit;
$$;

-- 6. Time series for charts
CREATE OR REPLACE FUNCTION public.owner_recharges_timeseries(_days int DEFAULT 30)
RETURNS TABLE(day date, total_usd numeric, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('day', approved_at)::date AS day,
         COALESCE(SUM(amount_usd), 0) AS total_usd,
         COUNT(*) AS count
  FROM public.recharge_requests
  WHERE status='approved' AND approved_at > now() - (_days || ' days')::interval
    AND public.has_role(auth.uid(),'owner')
  GROUP BY day ORDER BY day;
$$;

CREATE OR REPLACE FUNCTION public.owner_signups_timeseries(_days int DEFAULT 30)
RETURNS TABLE(day date, marketers bigint, cafeterias bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH days AS (
    SELECT generate_series(date_trunc('day', now() - (_days || ' days')::interval)::date, date_trunc('day', now())::date, '1 day'::interval)::date AS day
  )
  SELECT d.day,
    (SELECT COUNT(*) FROM public.marketers m WHERE date_trunc('day', m.created_at)::date = d.day) AS marketers,
    (SELECT COUNT(*) FROM public.cafeterias c WHERE date_trunc('day', c.created_at)::date = d.day) AS cafeterias
  FROM days d
  WHERE public.has_role(auth.uid(),'owner')
  ORDER BY d.day;
$$;
