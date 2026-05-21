CREATE POLICY "Cafeteria admin updates self"
ON public.cafeterias
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);