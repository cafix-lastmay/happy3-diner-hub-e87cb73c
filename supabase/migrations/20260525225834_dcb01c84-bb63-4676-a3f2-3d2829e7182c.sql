-- 1) Remove staff broad read of cafeterias (exposed financial/contact fields).
DROP POLICY IF EXISTS "Staff views own cafeteria" ON public.cafeterias;

-- 2) Tighten realtime.messages: remove unrestricted broadcast/presence access.
-- App only uses postgres_changes (which is governed by table RLS), so removing
-- these does not affect existing functionality.
DROP POLICY IF EXISTS "Authenticated users can use realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can send realtime" ON realtime.messages;