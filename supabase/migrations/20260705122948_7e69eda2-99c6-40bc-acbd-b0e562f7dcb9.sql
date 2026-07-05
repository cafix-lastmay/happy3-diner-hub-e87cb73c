
CREATE TYPE public.feedback_category AS ENUM ('complaint', 'suggestion', 'operational_issue', 'operational_error');
CREATE TYPE public.feedback_status AS ENUM ('new', 'in_review', 'resolved', 'closed');

CREATE TABLE public.app_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitter_role TEXT,
  submitter_name TEXT,
  submitter_contact TEXT,
  cafeteria_id UUID REFERENCES public.cafeterias(id) ON DELETE SET NULL,
  category public.feedback_category NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status public.feedback_status NOT NULL DEFAULT 'new',
  owner_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.app_feedback TO authenticated;
GRANT INSERT ON public.app_feedback TO anon;
GRANT ALL ON public.app_feedback TO service_role;

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert feedback"
  ON public.app_feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users view own feedback"
  ON public.app_feedback FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owner views all feedback"
  ON public.app_feedback FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owner updates feedback"
  ON public.app_feedback FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER app_feedback_updated_at
  BEFORE UPDATE ON public.app_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_app_feedback_created_at ON public.app_feedback(created_at DESC);
CREATE INDEX idx_app_feedback_status ON public.app_feedback(status);
CREATE INDEX idx_app_feedback_category ON public.app_feedback(category);
