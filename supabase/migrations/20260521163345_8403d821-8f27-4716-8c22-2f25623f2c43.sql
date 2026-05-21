
-- Allow managers to create recharge requests for their cafeteria
CREATE POLICY "Manager creates recharges"
ON public.recharge_requests
FOR INSERT
TO public
WITH CHECK (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());

-- Allow managers to view their cafeteria's recharges
CREATE POLICY "Manager views own recharges"
ON public.recharge_requests
FOR SELECT
TO public
USING (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());

-- Allow managers to view their cafeteria record (already covered via staff? add safe one)
CREATE POLICY "Manager views own cafeteria"
ON public.cafeterias
FOR SELECT
TO public
USING (ref_code = public.get_my_manager_cafeteria_ref());

-- Allow managers to update their cafeteria operational settings
CREATE POLICY "Manager updates own cafeteria"
ON public.cafeterias
FOR UPDATE
TO public
USING (ref_code = public.get_my_manager_cafeteria_ref())
WITH CHECK (ref_code = public.get_my_manager_cafeteria_ref());

-- Allow managers to manage payment info
CREATE POLICY "Manager manages payment info"
ON public.cafeteria_payment_info
FOR ALL
TO public
USING (cafeteria_ref_code = public.get_my_manager_cafeteria_ref())
WITH CHECK (cafeteria_ref_code = public.get_my_manager_cafeteria_ref());
