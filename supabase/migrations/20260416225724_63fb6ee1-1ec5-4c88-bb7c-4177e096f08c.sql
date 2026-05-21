
-- 1. Order status enum
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('new','preparing','ready','served','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. menu_categories
CREATE TABLE public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code TEXT NOT NULL REFERENCES public.cafeterias(ref_code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_categories_cafe ON public.menu_categories(cafeteria_ref_code);
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

-- 3. menu_items
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code TEXT NOT NULL REFERENCES public.cafeterias(ref_code) ON DELETE CASCADE,
  category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_items_cafe ON public.menu_items(cafeteria_ref_code);
CREATE INDEX idx_menu_items_cat ON public.menu_items(category_id);
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- 4. restaurant_tables
CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code TEXT NOT NULL REFERENCES public.cafeterias(ref_code) ON DELETE CASCADE,
  label TEXT NOT NULL,
  qr_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tables_cafe ON public.restaurant_tables(cafeteria_ref_code);
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

-- 5. staff
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  cafeteria_ref_code TEXT NOT NULL REFERENCES public.cafeterias(ref_code) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, cafeteria_ref_code)
);
CREATE INDEX idx_staff_cafe ON public.staff(cafeteria_ref_code);
CREATE INDEX idx_staff_user ON public.staff(user_id);
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- 6. Helper function (after staff table exists)
CREATE OR REPLACE FUNCTION public.get_my_staff_cafeteria_ref()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cafeteria_ref_code FROM public.staff WHERE user_id = auth.uid() AND is_active = true LIMIT 1
$$;

-- 7. orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafeteria_ref_code TEXT NOT NULL REFERENCES public.cafeterias(ref_code) ON DELETE CASCADE,
  table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  table_label TEXT NOT NULL,
  customer_name TEXT,
  notes TEXT,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_cafe ON public.orders(cafeteria_ref_code);
CREATE INDEX idx_orders_status ON public.orders(status);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 8. order_items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name_snapshot TEXT NOT NULL,
  price_snapshot NUMERIC(12,2) NOT NULL,
  qty INT NOT NULL CHECK (qty > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 9. Triggers
CREATE TRIGGER tr_menu_categories_updated BEFORE UPDATE ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER tr_menu_items_updated BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER tr_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 10. RLS Policies
-- menu_categories
CREATE POLICY "Cafe manages own categories" ON public.menu_categories
  FOR ALL USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code())
  WITH CHECK (cafeteria_ref_code = public.get_my_cafeteria_ref_code());
CREATE POLICY "Owner views all categories" ON public.menu_categories
  FOR SELECT USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Public reads active categories" ON public.menu_categories
  FOR SELECT USING (is_active = true);
CREATE POLICY "Staff views own cafe categories" ON public.menu_categories
  FOR SELECT USING (cafeteria_ref_code = public.get_my_staff_cafeteria_ref());

-- menu_items
CREATE POLICY "Cafe manages own items" ON public.menu_items
  FOR ALL USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code())
  WITH CHECK (cafeteria_ref_code = public.get_my_cafeteria_ref_code());
CREATE POLICY "Owner views all items" ON public.menu_items
  FOR SELECT USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Public reads available items" ON public.menu_items
  FOR SELECT USING (is_available = true);
CREATE POLICY "Staff views own cafe items" ON public.menu_items
  FOR SELECT USING (cafeteria_ref_code = public.get_my_staff_cafeteria_ref());

-- restaurant_tables
CREATE POLICY "Cafe manages own tables" ON public.restaurant_tables
  FOR ALL USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code())
  WITH CHECK (cafeteria_ref_code = public.get_my_cafeteria_ref_code());
CREATE POLICY "Owner views all tables" ON public.restaurant_tables
  FOR SELECT USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "Staff views own cafe tables" ON public.restaurant_tables
  FOR SELECT USING (cafeteria_ref_code = public.get_my_staff_cafeteria_ref());
CREATE POLICY "Public reads active tables" ON public.restaurant_tables
  FOR SELECT USING (is_active = true);

-- staff
CREATE POLICY "Cafe manages own staff" ON public.staff
  FOR ALL USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code())
  WITH CHECK (cafeteria_ref_code = public.get_my_cafeteria_ref_code());
CREATE POLICY "Staff views self" ON public.staff
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Owner views all staff" ON public.staff
  FOR SELECT USING (public.has_role(auth.uid(),'owner'));

-- orders
CREATE POLICY "Cafe views own orders" ON public.orders
  FOR SELECT USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code());
CREATE POLICY "Cafe updates own orders" ON public.orders
  FOR UPDATE USING (cafeteria_ref_code = public.get_my_cafeteria_ref_code());
CREATE POLICY "Staff views own cafe orders" ON public.orders
  FOR SELECT USING (cafeteria_ref_code = public.get_my_staff_cafeteria_ref());
CREATE POLICY "Staff updates own cafe orders" ON public.orders
  FOR UPDATE USING (cafeteria_ref_code = public.get_my_staff_cafeteria_ref());
CREATE POLICY "Owner views all orders" ON public.orders
  FOR SELECT USING (public.has_role(auth.uid(),'owner'));

-- order_items
CREATE POLICY "Cafe views own order items" ON public.order_items
  FOR SELECT USING (EXISTS(SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.cafeteria_ref_code = public.get_my_cafeteria_ref_code()));
CREATE POLICY "Staff views own cafe order items" ON public.order_items
  FOR SELECT USING (EXISTS(SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.cafeteria_ref_code = public.get_my_staff_cafeteria_ref()));
CREATE POLICY "Owner views all order items" ON public.order_items
  FOR SELECT USING (public.has_role(auth.uid(),'owner'));

-- 11. RPC: place_order (anon customers via QR)
CREATE OR REPLACE FUNCTION public.place_order(
  _qr_token TEXT, _customer_name TEXT, _notes TEXT, _items JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tbl RECORD; it JSONB; mi RECORD; qty INT;
  item_total NUMERIC(12,2); grand NUMERIC(12,2) := 0; new_order_id UUID;
BEGIN
  SELECT * INTO tbl FROM public.restaurant_tables WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive table'; END IF;
  IF jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Empty order'; END IF;

  INSERT INTO public.orders (cafeteria_ref_code, table_id, table_label, customer_name, notes, total, status)
  VALUES (tbl.cafeteria_ref_code, tbl.id, tbl.label, NULLIF(_customer_name,''), NULLIF(_notes,''), 0, 'new')
  RETURNING id INTO new_order_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    qty := COALESCE((it->>'qty')::INT, 0);
    IF qty <= 0 THEN CONTINUE; END IF;
    SELECT * INTO mi FROM public.menu_items
      WHERE id = (it->>'item_id')::UUID
        AND cafeteria_ref_code = tbl.cafeteria_ref_code
        AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item not available'; END IF;
    item_total := mi.price * qty;
    grand := grand + item_total;
    INSERT INTO public.order_items (order_id, item_id, name_snapshot, price_snapshot, qty, notes)
    VALUES (new_order_id, mi.id, mi.name, mi.price, qty, NULLIF(it->>'notes',''));
  END LOOP;

  UPDATE public.orders SET total = grand WHERE id = new_order_id;
  RETURN new_order_id;
END $$;

REVOKE ALL ON FUNCTION public.place_order(TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(TEXT,TEXT,TEXT,JSONB) TO anon, authenticated;

-- 12. RPC: get_order_status for anon tracking
CREATE OR REPLACE FUNCTION public.get_order_status(_order_id UUID, _qr_token TEXT)
RETURNS TABLE(id UUID, status public.order_status, total NUMERIC, table_label TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.status, o.total, o.table_label, o.created_at
  FROM public.orders o
  JOIN public.restaurant_tables t ON t.id = o.table_id
  WHERE o.id = _order_id AND t.qr_token = _qr_token
$$;
GRANT EXECUTE ON FUNCTION public.get_order_status(UUID,TEXT) TO anon, authenticated;

-- 13. Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images','menu-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public reads menu images" ON storage.objects
  FOR SELECT USING (bucket_id = 'menu-images');
CREATE POLICY "Cafe uploads menu images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'menu-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Cafe updates own menu images" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'menu-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Cafe deletes own menu images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'menu-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 14. Realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
