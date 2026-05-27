-- Feature 1: Commission eligibility period (global)
ALTER TABLE public.app_settings 
  ADD COLUMN IF NOT EXISTS commission_eligibility_months integer NOT NULL DEFAULT 12;

-- Feature 2: Per-marketer override
ALTER TABLE public.marketers 
  ADD COLUMN IF NOT EXISTS custom_commission_months integer;

-- Feature 3: Suspension fields
ALTER TABLE public.cafeterias 
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS suspended_by uuid;

-- Owner-only RPC to suspend/unsuspend a cafeteria
CREATE OR REPLACE FUNCTION public.owner_set_cafeteria_suspension(
  _ref_code text,
  _suspended boolean,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'owner'::app_role) THEN
    RAISE EXCEPTION 'Only owner can suspend cafeterias';
  END IF;

  UPDATE public.cafeterias
  SET is_suspended = _suspended,
      suspension_reason = CASE WHEN _suspended THEN _reason ELSE NULL END,
      suspended_at = CASE WHEN _suspended THEN now() ELSE NULL END,
      suspended_by = CASE WHEN _suspended THEN auth.uid() ELSE NULL END,
      updated_at = now()
  WHERE ref_code = _ref_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_set_cafeteria_suspension(text, boolean, text) TO authenticated;

-- Update place_order RPC to reject suspended cafeterias (wrap existing logic via early check trigger)
-- Use a BEFORE INSERT trigger on orders to enforce suspension
CREATE OR REPLACE FUNCTION public.enforce_cafeteria_not_suspended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _suspended boolean;
BEGIN
  SELECT is_suspended INTO _suspended FROM public.cafeterias WHERE ref_code = NEW.cafeteria_ref_code;
  IF _suspended THEN
    RAISE EXCEPTION 'الكافيتريا موقوفة';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cafe_not_suspended ON public.orders;
CREATE TRIGGER trg_enforce_cafe_not_suspended
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cafeteria_not_suspended();
