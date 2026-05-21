-- Table sections (e.g., Terrace, Garden, Indoor)
CREATE TABLE public.table_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code TEXT NOT NULL REFERENCES public.cafeterias(ref_code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.table_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cafe manages own sections" ON public.table_sections
  FOR ALL USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code())
  WITH CHECK (cafeteria_ref_code = public.get_my_cafeteria_ref_code());

CREATE POLICY "Owner views all sections" ON public.table_sections
  FOR SELECT USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Staff views own cafe sections" ON public.table_sections
  FOR SELECT USING (cafeteria_ref_code = public.get_my_staff_cafeteria_ref());

CREATE POLICY "Public reads active sections" ON public.table_sections
  FOR SELECT USING (is_active = true);

CREATE TRIGGER trg_table_sections_updated
  BEFORE UPDATE ON public.table_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Add section + QR customization fields to restaurant_tables
ALTER TABLE public.restaurant_tables
  ADD COLUMN section_id UUID REFERENCES public.table_sections(id) ON DELETE SET NULL,
  ADD COLUMN qr_top_text TEXT,
  ADD COLUMN qr_bottom_text TEXT,
  ADD COLUMN qr_text_language TEXT NOT NULL DEFAULT 'ar',
  ADD COLUMN qr_font_size INT NOT NULL DEFAULT 14;

CREATE INDEX idx_restaurant_tables_section ON public.restaurant_tables(section_id);
CREATE INDEX idx_table_sections_cafe ON public.table_sections(cafeteria_ref_code);