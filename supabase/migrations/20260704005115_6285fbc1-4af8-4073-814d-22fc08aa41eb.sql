
-- ============================================================
-- Persistent table service calls (waiter / cleaner / manager)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.table_call_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code text NOT NULL,
  table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  table_label text,
  section_id uuid,
  kind text NOT NULL CHECK (kind IN ('waiter','cleaner','manager')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  from_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE INDEX IF NOT EXISTS idx_tcr_active_by_cafe
  ON public.table_call_requests(cafeteria_ref_code, status);
CREATE INDEX IF NOT EXISTS idx_tcr_active_by_table_kind
  ON public.table_call_requests(table_id, kind) WHERE status = 'active';

GRANT SELECT ON public.table_call_requests TO authenticated;
GRANT ALL ON public.table_call_requests TO service_role;

ALTER TABLE public.table_call_requests ENABLE ROW LEVEL SECURITY;

-- Cafeteria admin: own cafeteria
CREATE POLICY "tcr_cafe_admin_select" ON public.table_call_requests
FOR SELECT TO authenticated
USING (
  cafeteria_ref_code IN (
    SELECT ref_code FROM public.cafeterias WHERE user_id = auth.uid()
  )
);

-- Manager: their cafeteria
CREATE POLICY "tcr_manager_select" ON public.table_call_requests
FOR SELECT TO authenticated
USING (
  cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
);

-- Staff (waiter): section-scoped when scopes exist; otherwise entire cafeteria
CREATE POLICY "tcr_staff_select" ON public.table_call_requests
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.cafeteria_ref_code = table_call_requests.cafeteria_ref_code
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.staff_scopes sc
          WHERE sc.staff_id = s.id AND sc.kind = 'section'
        )
        OR table_call_requests.section_id IN (
          SELECT sc.ref_id FROM public.staff_scopes sc
          WHERE sc.staff_id = s.id AND sc.kind = 'section'
        )
      )
  )
);

-- Add to realtime publication
ALTER TABLE public.table_call_requests REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='table_call_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.table_call_requests';
  END IF;
END $$;

-- ============================================================
-- RPCs
-- ============================================================
-- Customer: create a call from a QR token. Prevents duplicate active same-kind.
CREATE OR REPLACE FUNCTION public.create_table_call(_qr_token text, _kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.restaurant_tables%ROWTYPE;
  v_existing uuid;
  v_new_id uuid;
BEGIN
  IF _kind NOT IN ('waiter','cleaner','manager') THEN
    RAISE EXCEPTION 'INVALID_KIND';
  END IF;

  SELECT * INTO v_table FROM public.restaurant_tables
  WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'TABLE_NOT_FOUND'; END IF;

  SELECT id INTO v_existing FROM public.table_call_requests
  WHERE table_id = v_table.id AND kind = _kind AND status = 'active'
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.table_call_requests
    (cafeteria_ref_code, table_id, table_label, section_id, kind, from_role)
  VALUES
    (v_table.cafeteria_ref_code, v_table.id, v_table.label, v_table.section_id, _kind, 'customer')
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END $$;

REVOKE ALL ON FUNCTION public.create_table_call(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_table_call(text,text) TO anon, authenticated;

-- Check if a call is still active (customer polling)
CREATE OR REPLACE FUNCTION public.is_table_call_active(_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.table_call_requests WHERE id = _id AND status = 'active');
$$;
REVOKE ALL ON FUNCTION public.is_table_call_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_table_call_active(uuid) TO anon, authenticated;

-- Check active kinds for a table (by qr_token) — customer disables buttons
CREATE OR REPLACE FUNCTION public.get_active_calls_for_qr(_qr_token text)
RETURNS TABLE(id uuid, kind text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.kind
  FROM public.table_call_requests c
  JOIN public.restaurant_tables t ON t.id = c.table_id
  WHERE t.qr_token = _qr_token AND c.status = 'active';
$$;
REVOKE ALL ON FUNCTION public.get_active_calls_for_qr(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_calls_for_qr(text) TO anon, authenticated;

-- Staff/manager/admin: resolve a call (RLS-authorized via SELECT visibility)
CREATE OR REPLACE FUNCTION public.resolve_table_call(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visible boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  -- rely on RLS visibility: run a SELECT as the caller by checking via a subquery in a security invoker view
  -- Since this is SECURITY DEFINER, enforce manually:
  SELECT EXISTS (
    SELECT 1 FROM public.table_call_requests r
    WHERE r.id = _id
      AND (
        r.cafeteria_ref_code IN (SELECT ref_code FROM public.cafeterias WHERE user_id = auth.uid())
        OR r.cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
        OR EXISTS (
          SELECT 1 FROM public.staff s
          WHERE s.user_id = auth.uid() AND s.is_active = true
            AND s.cafeteria_ref_code = r.cafeteria_ref_code
            AND (
              NOT EXISTS (SELECT 1 FROM public.staff_scopes sc WHERE sc.staff_id = s.id AND sc.kind='section')
              OR r.section_id IN (SELECT sc.ref_id FROM public.staff_scopes sc WHERE sc.staff_id = s.id AND sc.kind='section')
            )
        )
      )
  ) INTO v_visible;

  IF NOT v_visible THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  UPDATE public.table_call_requests
  SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = _id AND status = 'active';
END $$;
REVOKE ALL ON FUNCTION public.resolve_table_call(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_table_call(uuid) TO authenticated;

-- List active calls visible to the caller (staff/manager/admin)
CREATE OR REPLACE FUNCTION public.list_active_table_calls()
RETURNS SETOF public.table_call_requests
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.table_call_requests WHERE status = 'active' ORDER BY created_at ASC;
$$;
REVOKE ALL ON FUNCTION public.list_active_table_calls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_table_calls() TO authenticated;
