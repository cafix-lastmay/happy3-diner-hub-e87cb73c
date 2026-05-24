-- 1. Tighten delivery_details SELECT: remove staff branch
DROP POLICY IF EXISTS "Cafe staff view delivery details" ON public.delivery_details;
CREATE POLICY "Cafe admin/manager view delivery details"
ON public.delivery_details
FOR SELECT
USING (
  cafeteria_ref_code = get_my_cafeteria_ref_code()
  OR cafeteria_ref_code = get_my_manager_cafeteria_ref()
);

-- 2. realtime.messages: require authentication for broadcast/presence subscriptions.
-- (postgres_changes uses the underlying table's RLS, not this table.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='realtime' AND c.relname='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can use realtime" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Authenticated users can use realtime"
              ON realtime.messages FOR SELECT TO authenticated USING (true)$p$;
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can send realtime" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "Authenticated users can send realtime"
              ON realtime.messages FOR INSERT TO authenticated WITH CHECK (true)$p$;
  END IF;
END $$;

-- 3. Fix mutable search_path on tg_custom_grace_sync
CREATE OR REPLACE FUNCTION public.tg_custom_grace_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_cafeteria_trial_from_custom_grace(OLD.cafeteria_ref_code);
    RETURN OLD;
  ELSE
    PERFORM public.sync_cafeteria_trial_from_custom_grace(NEW.cafeteria_ref_code);
    IF TG_OP = 'UPDATE' AND OLD.cafeteria_ref_code <> NEW.cafeteria_ref_code THEN
      PERFORM public.sync_cafeteria_trial_from_custom_grace(OLD.cafeteria_ref_code);
    END IF;
    RETURN NEW;
  END IF;
END;
$function$;