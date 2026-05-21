
CREATE TABLE IF NOT EXISTS public.cafeteria_payment_info (
  cafeteria_ref_code text PRIMARY KEY,
  bank_details text,
  payment_instructions text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cafeteria_payment_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cafe admin manages own payment info" ON public.cafeteria_payment_info;
CREATE POLICY "Cafe admin manages own payment info"
  ON public.cafeteria_payment_info
  FOR ALL
  USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code())
  WITH CHECK (cafeteria_ref_code = public.get_my_cafeteria_ref_code());

DROP POLICY IF EXISTS "Owner manages all payment info" ON public.cafeteria_payment_info;
CREATE POLICY "Owner manages all payment info"
  ON public.cafeteria_payment_info
  FOR ALL
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

INSERT INTO public.cafeteria_payment_info (cafeteria_ref_code, bank_details, payment_instructions)
SELECT ref_code, bank_details, payment_instructions
FROM public.cafeterias
WHERE bank_details IS NOT NULL OR payment_instructions IS NOT NULL
ON CONFLICT (cafeteria_ref_code) DO NOTHING;

ALTER TABLE public.cafeterias DROP COLUMN IF EXISTS bank_details;
ALTER TABLE public.cafeterias DROP COLUMN IF EXISTS payment_instructions;

CREATE OR REPLACE FUNCTION public.tg_cafeteria_payment_info_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cafeteria_payment_info_updated_at ON public.cafeteria_payment_info;
CREATE TRIGGER trg_cafeteria_payment_info_updated_at
  BEFORE UPDATE ON public.cafeteria_payment_info
  FOR EACH ROW EXECUTE FUNCTION public.tg_cafeteria_payment_info_touch();
