
-- 1) menu_item_sizes table
CREATE TABLE IF NOT EXISTS public.menu_item_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_item_sizes_item_idx ON public.menu_item_sizes(menu_item_id, sort_order);

GRANT SELECT ON public.menu_item_sizes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_item_sizes TO authenticated;
GRANT ALL ON public.menu_item_sizes TO service_role;

ALTER TABLE public.menu_item_sizes ENABLE ROW LEVEL SECURITY;

-- Public read (menu data is public; matches menu_items model)
CREATE POLICY "menu_item_sizes_read_all" ON public.menu_item_sizes
  FOR SELECT USING (true);

-- Write only by the cafeteria owner or its manager
CREATE POLICY "menu_item_sizes_write_owner_or_manager" ON public.menu_item_sizes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.menu_items mi
      JOIN public.cafeterias c ON c.ref_code = mi.cafeteria_ref_code
      WHERE mi.id = menu_item_sizes.menu_item_id
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.cafeteria_ref_code = c.ref_code
              AND s.user_id = auth.uid()
              AND s.role = 'manager'
              AND s.is_active = true
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.menu_items mi
      JOIN public.cafeterias c ON c.ref_code = mi.cafeteria_ref_code
      WHERE mi.id = menu_item_sizes.menu_item_id
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.cafeteria_ref_code = c.ref_code
              AND s.user_id = auth.uid()
              AND s.role = 'manager'
              AND s.is_active = true
          )
        )
    )
  );

-- Only one default size per menu_item
CREATE UNIQUE INDEX IF NOT EXISTS menu_item_sizes_one_default
  ON public.menu_item_sizes(menu_item_id) WHERE is_default = true;

-- 2) Extend order_items with size snapshot fields
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS size_id uuid,
  ADD COLUMN IF NOT EXISTS size_name text,
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,2);
