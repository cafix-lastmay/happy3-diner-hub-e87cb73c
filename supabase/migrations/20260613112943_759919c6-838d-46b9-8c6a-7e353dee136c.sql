
-- 1) Block cafeteria self-update of sensitive columns via trigger
CREATE OR REPLACE FUNCTION public.cafeterias_protect_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'owner'::app_role) THEN
    RETURN NEW;
  END IF;
  NEW.points_balance      := OLD.points_balance;
  NEW.is_active           := OLD.is_active;
  NEW.is_suspended        := OLD.is_suspended;
  NEW.suspended_by        := OLD.suspended_by;
  NEW.suspended_at        := OLD.suspended_at;
  NEW.suspension_reason   := OLD.suspension_reason;
  NEW.parent_ref_code     := OLD.parent_ref_code;
  NEW.free_trial_until    := OLD.free_trial_until;
  NEW.trial_consumed      := OLD.trial_consumed;
  NEW.trial_start         := OLD.trial_start;
  NEW.grace_period_active := OLD.grace_period_active;
  NEW.grace_period_started_at := OLD.grace_period_started_at;
  NEW.ref_code            := OLD.ref_code;
  NEW.signup_type         := OLD.signup_type;
  NEW.user_id             := OLD.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cafeterias_protect_sensitive ON public.cafeterias;
CREATE TRIGGER trg_cafeterias_protect_sensitive
BEFORE UPDATE ON public.cafeterias
FOR EACH ROW EXECUTE FUNCTION public.cafeterias_protect_sensitive_columns();

-- 2) Restrict driver_wallet_entries visibility to admins/managers only (exclude waiter/chef)
DROP POLICY IF EXISTS "Cafe staff view wallet" ON public.driver_wallet_entries;
CREATE POLICY "Cafe admin or manager view wallet"
ON public.driver_wallet_entries
FOR SELECT
TO authenticated
USING (
  cafeteria_ref_code = public.get_my_cafeteria_ref_code()
  OR cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
);

-- 3) Cleanup stale public read policy on recharge_instructions (idempotent)
DROP POLICY IF EXISTS "Anyone reads instructions" ON public.recharge_instructions;
DROP POLICY IF EXISTS "Anyone reads recharge instructions" ON public.recharge_instructions;
