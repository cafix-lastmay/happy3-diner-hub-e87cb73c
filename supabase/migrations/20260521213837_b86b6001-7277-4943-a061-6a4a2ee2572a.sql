-- Enable realtime for tables used by cafeteria/manager pages.
-- Without these, the .subscribe() calls cannot deliver events; combined with
-- replica identity issues this surfaced as page-load errors.
ALTER TABLE public.staff REPLICA IDENTITY FULL;
ALTER TABLE public.menu_categories REPLICA IDENTITY FULL;
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;
ALTER TABLE public.table_sections REPLICA IDENTITY FULL;
ALTER TABLE public.restaurant_tables REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.staff; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_categories; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sections; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;