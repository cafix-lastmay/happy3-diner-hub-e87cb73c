-- 1. recharge_instructions: restrict public read to authenticated users
DROP POLICY IF EXISTS "Anyone reads recharge instructions" ON public.recharge_instructions;
DROP POLICY IF EXISTS "Public reads recharge instructions" ON public.recharge_instructions;
DROP POLICY IF EXISTS "Authenticated reads recharge instructions" ON public.recharge_instructions;
CREATE POLICY "Authenticated reads recharge instructions"
  ON public.recharge_instructions
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Remove staff table from realtime publication (cross-tenant leakage)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.staff';
  END IF;
END$$;

-- 3. get_order_status: do not fall back to email
CREATE OR REPLACE FUNCTION public.get_order_status(_order_id uuid, _qr_token text)
 RETURNS TABLE(id uuid, status order_status, total numeric, table_label text, created_at timestamp with time zone, waiter_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.status, o.total, o.table_label, o.created_at,
         NULLIF(trim(p.full_name), '') AS waiter_name
  FROM public.orders o
  JOIN public.restaurant_tables t ON t.id = o.table_id
  LEFT JOIN public.profiles p ON p.id = o.served_by
  WHERE o.id = _order_id AND t.qr_token = _qr_token
$function$;

-- 4. Explicit staff SELECT policy on cafeterias
DROP POLICY IF EXISTS "Staff views own cafeteria" ON public.cafeterias;
CREATE POLICY "Staff views own cafeteria"
  ON public.cafeterias
  FOR SELECT
  USING (ref_code = get_my_staff_cafeteria_ref());

NOTIFY pgrst, 'reload schema';