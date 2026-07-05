
DROP POLICY IF EXISTS "Anyone can insert feedback" ON public.app_feedback;
CREATE POLICY "Anyone can insert feedback"
  ON public.app_feedback AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (true);
GRANT INSERT ON public.app_feedback TO anon, authenticated;
