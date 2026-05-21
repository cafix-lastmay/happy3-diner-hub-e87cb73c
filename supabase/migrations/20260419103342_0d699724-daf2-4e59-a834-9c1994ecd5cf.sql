-- Add header/footer image URLs to cafeterias for menu branding
ALTER TABLE public.cafeterias
  ADD COLUMN IF NOT EXISTS menu_header_url text,
  ADD COLUMN IF NOT EXISTS menu_footer_url text;

-- Extend get_menu_for_qr to include header/footer URLs
CREATE OR REPLACE FUNCTION public.get_menu_for_qr(_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  tbl RECORD;
  cafe RECORD;
  cats jsonb;
  items jsonb;
BEGIN
  SELECT id, cafeteria_ref_code, label, section_id
    INTO tbl
    FROM public.restaurant_tables
   WHERE qr_token = _qr_token AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT ref_code, name, currency_code, menu_header_url, menu_footer_url
    INTO cafe
    FROM public.cafeterias
   WHERE ref_code = tbl.cafeteria_ref_code AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'sort_order', c.sort_order
         ) ORDER BY c.sort_order), '[]'::jsonb)
    INTO cats
    FROM public.menu_categories c
   WHERE c.cafeteria_ref_code = tbl.cafeteria_ref_code AND c.is_active = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'category_id', i.category_id,
           'name', i.name,
           'description', i.description,
           'price', i.price,
           'image_url', i.image_url,
           'sort_order', i.sort_order
         ) ORDER BY i.sort_order), '[]'::jsonb)
    INTO items
    FROM public.menu_items i
   WHERE i.cafeteria_ref_code = tbl.cafeteria_ref_code AND i.is_available = true;

  RETURN jsonb_build_object(
    'table',      jsonb_build_object('id', tbl.id, 'label', tbl.label, 'cafeteria_ref_code', tbl.cafeteria_ref_code),
    'cafeteria',  jsonb_build_object(
                    'ref_code', cafe.ref_code,
                    'name', cafe.name,
                    'currency_code', cafe.currency_code,
                    'menu_header_url', cafe.menu_header_url,
                    'menu_footer_url', cafe.menu_footer_url
                  ),
    'categories', cats,
    'items',      items
  );
END;
$function$;

-- Drop and recreate get_order_status to add waiter_name column
DROP FUNCTION IF EXISTS public.get_order_status(uuid, text);

CREATE FUNCTION public.get_order_status(_order_id uuid, _qr_token text)
RETURNS TABLE(id uuid, status order_status, total numeric, table_label text, created_at timestamp with time zone, waiter_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT o.id, o.status, o.total, o.table_label, o.created_at,
         COALESCE(p.full_name, p.email) AS waiter_name
  FROM public.orders o
  JOIN public.restaurant_tables t ON t.id = o.table_id
  LEFT JOIN public.profiles p ON p.id = o.served_by
  WHERE o.id = _order_id AND t.qr_token = _qr_token
$function$;