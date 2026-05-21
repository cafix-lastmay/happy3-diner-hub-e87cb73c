
-- 1) Exchange rates table (owner-managed, used by all cafeterias)
CREATE TABLE public.exchange_rates (
  currency_code text PRIMARY KEY REFERENCES public.currencies(code) ON DELETE CASCADE,
  rate_to_usd numeric NOT NULL CHECK (rate_to_usd > 0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads exchange rates"
  ON public.exchange_rates FOR SELECT
  USING (true);

CREATE POLICY "Owner manages exchange rates"
  ON public.exchange_rates FOR ALL
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

-- Seed initial rate for USD = 1
INSERT INTO public.exchange_rates (currency_code, rate_to_usd)
SELECT code, 1 FROM public.currencies WHERE code = 'USD'
ON CONFLICT DO NOTHING;

-- 2) Custom grace period assignments per cafeteria (owner-defined)
CREATE TABLE public.custom_grace_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code text NOT NULL,
  start_date date NOT NULL,
  days integer NOT NULL CHECK (days > 0 AND days <= 365),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_grace_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages custom grace periods"
  ON public.custom_grace_periods FOR ALL
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "Cafe sees own grace periods"
  ON public.custom_grace_periods FOR SELECT
  USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code());

CREATE INDEX idx_custom_grace_cafe ON public.custom_grace_periods(cafeteria_ref_code, start_date);
