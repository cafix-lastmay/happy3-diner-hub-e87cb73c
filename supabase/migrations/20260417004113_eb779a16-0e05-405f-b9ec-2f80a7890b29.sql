-- =========================================================
-- Phase 4: Manager role, recharge instructions, shifts, tips
-- =========================================================

-- Helper: get cafeteria ref for a logged-in manager
CREATE OR REPLACE FUNCTION public.get_my_manager_cafeteria_ref()
RETURNS TEXT
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cafeteria_ref_code FROM public.staff
  WHERE user_id = auth.uid() AND role = 'manager' AND is_active = true
  LIMIT 1
$$;

-- Helper: combined "admin or manager of this cafeteria"
CREATE OR REPLACE FUNCTION public.is_cafe_admin_or_manager(_cafe_ref TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _cafe_ref = public.get_my_cafeteria_ref_code()
    OR _cafe_ref = public.get_my_manager_cafeteria_ref()
$$;

-- =========================================================
-- 1. Recharge instructions (single global text, owner-edited)
-- =========================================================
CREATE TABLE public.recharge_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

INSERT INTO public.recharge_instructions (body) VALUES ('');

ALTER TABLE public.recharge_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads instructions" ON public.recharge_instructions
  FOR SELECT USING (true);

CREATE POLICY "Owner manages instructions" ON public.recharge_instructions
  FOR ALL USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

-- =========================================================
-- 2. Shifts
-- =========================================================
CREATE TYPE public.shift_status AS ENUM ('pending', 'active', 'closed', 'rejected');

CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code TEXT NOT NULL REFERENCES public.cafeterias(ref_code) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL,
  staff_role public.app_role NOT NULL,
  status public.shift_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  tips_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders_count INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shifts_cafe ON public.shifts(cafeteria_ref_code);
CREATE INDEX idx_shifts_user ON public.shifts(staff_user_id);
CREATE INDEX idx_shifts_status ON public.shifts(status);

-- Only one active shift per user at a time
CREATE UNIQUE INDEX uniq_active_shift_per_user
  ON public.shifts(staff_user_id) WHERE status IN ('pending', 'active');

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Staff can read their own shifts and create pending ones for themselves
CREATE POLICY "Staff views own shifts" ON public.shifts
  FOR SELECT USING (staff_user_id = auth.uid());

CREATE POLICY "Staff requests own shift" ON public.shifts
  FOR INSERT WITH CHECK (
    staff_user_id = auth.uid()
    AND cafeteria_ref_code = public.get_my_staff_cafeteria_ref()
  );

-- Cafeteria admin or active manager: full read/update of cafeteria shifts
CREATE POLICY "Cafe admin/manager views shifts" ON public.shifts
  FOR SELECT USING (public.is_cafe_admin_or_manager(cafeteria_ref_code));

CREATE POLICY "Cafe admin/manager updates shifts" ON public.shifts
  FOR UPDATE USING (public.is_cafe_admin_or_manager(cafeteria_ref_code));

CREATE POLICY "Cafe admin inserts shifts" ON public.shifts
  FOR INSERT WITH CHECK (cafeteria_ref_code = public.get_my_cafeteria_ref_code());

CREATE POLICY "Owner views all shifts" ON public.shifts
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'::app_role));

-- =========================================================
-- 3. Tips & served_by on orders
-- =========================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS served_by UUID,
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shift ON public.orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_orders_served_by ON public.orders(served_by);

-- =========================================================
-- 4. Extend manager-friendly RLS on existing cafeteria-scoped tables
-- =========================================================

-- menu_categories: allow manager
CREATE POLICY "Manager manages categories" ON public.menu_categories
  FOR ALL USING (cafeteria_ref_code = public.get_my_manager_cafeteria_ref())
  WITH CHECK (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());

-- menu_items
CREATE POLICY "Manager manages items" ON public.menu_items
  FOR ALL USING (cafeteria_ref_code = public.get_my_manager_cafeteria_ref())
  WITH CHECK (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());

-- restaurant_tables
CREATE POLICY "Manager manages tables" ON public.restaurant_tables
  FOR ALL USING (cafeteria_ref_code = public.get_my_manager_cafeteria_ref())
  WITH CHECK (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());

-- table_sections
CREATE POLICY "Manager manages sections" ON public.table_sections
  FOR ALL USING (cafeteria_ref_code = public.get_my_manager_cafeteria_ref())
  WITH CHECK (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());

-- staff (manager can toggle waiter/chef but not other managers/admins)
CREATE POLICY "Manager manages non-admin staff" ON public.staff
  FOR ALL USING (
    cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
    AND role IN ('waiter'::app_role, 'chef'::app_role)
  )
  WITH CHECK (
    cafeteria_ref_code = public.get_my_manager_cafeteria_ref()
    AND role IN ('waiter'::app_role, 'chef'::app_role)
  );

-- orders
CREATE POLICY "Manager views orders" ON public.orders
  FOR SELECT USING (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());

CREATE POLICY "Manager updates orders" ON public.orders
  FOR UPDATE USING (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());

-- order_items (read)
CREATE POLICY "Manager views order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.cafeteria_ref_code = public.get_my_manager_cafeteria_ref())
  );

-- =========================================================
-- 5. Shift workflow RPCs
-- =========================================================

-- Staff requests to start a shift
CREATE OR REPLACE FUNCTION public.request_shift()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  new_id UUID;
  active_manager_exists BOOLEAN;
BEGIN
  SELECT * INTO s FROM public.staff
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a staff member'; END IF;

  -- Manager: auto-approve, requires admin to enable. We auto-activate if cafe admin allows.
  -- For now manager shift is auto-active on request.
  IF s.role = 'manager' THEN
    INSERT INTO public.shifts(cafeteria_ref_code, staff_user_id, staff_role, status, approved_at, approved_by)
    VALUES (s.cafeteria_ref_code, auth.uid(), s.role, 'active', now(), auth.uid())
    RETURNING id INTO new_id;
  ELSE
    -- Waiter/chef: pending, must be approved by admin or active manager
    INSERT INTO public.shifts(cafeteria_ref_code, staff_user_id, staff_role, status)
    VALUES (s.cafeteria_ref_code, auth.uid(), s.role, 'pending')
    RETURNING id INTO new_id;
  END IF;

  RETURN new_id;
END $$;

-- Admin or active manager approves a shift
CREATE OR REPLACE FUNCTION public.approve_shift(_shift_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sh RECORD;
BEGIN
  SELECT * INTO sh FROM public.shifts WHERE id = _shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF NOT public.is_cafe_admin_or_manager(sh.cafeteria_ref_code) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF sh.status <> 'pending' THEN RAISE EXCEPTION 'Shift not pending'; END IF;

  UPDATE public.shifts
  SET status = 'active', approved_at = now(), approved_by = auth.uid()
  WHERE id = _shift_id;
END $$;

-- Reject a pending shift
CREATE OR REPLACE FUNCTION public.reject_shift(_shift_id UUID, _reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sh RECORD;
BEGIN
  SELECT * INTO sh FROM public.shifts WHERE id = _shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF NOT public.is_cafe_admin_or_manager(sh.cafeteria_ref_code) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.shifts
  SET status = 'rejected', notes = _reason, closed_at = now(), closed_by = auth.uid()
  WHERE id = _shift_id AND status IN ('pending','active');
END $$;

-- Close a shift (self, admin, or manager)
CREATE OR REPLACE FUNCTION public.close_shift(_shift_id UUID, _tips NUMERIC DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sh RECORD;
  computed_tips NUMERIC(12,2);
  computed_count INT;
BEGIN
  SELECT * INTO sh FROM public.shifts WHERE id = _shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF sh.staff_user_id <> auth.uid()
     AND NOT public.is_cafe_admin_or_manager(sh.cafeteria_ref_code) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Compute tip total + orders count from linked orders
  SELECT COALESCE(SUM(tip_amount),0), COUNT(*) INTO computed_tips, computed_count
  FROM public.orders WHERE shift_id = _shift_id;

  UPDATE public.shifts
  SET status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      tips_total = COALESCE(_tips, computed_tips),
      orders_count = computed_count
  WHERE id = _shift_id AND status IN ('pending','active');
END $$;

-- Get my active shift (helper for waiter/chef UI)
CREATE OR REPLACE FUNCTION public.get_my_active_shift()
RETURNS TABLE(id UUID, status public.shift_status, requested_at TIMESTAMPTZ, approved_at TIMESTAMPTZ)
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, status, requested_at, approved_at
  FROM public.shifts
  WHERE staff_user_id = auth.uid() AND status IN ('pending','active')
  ORDER BY requested_at DESC LIMIT 1
$$;
