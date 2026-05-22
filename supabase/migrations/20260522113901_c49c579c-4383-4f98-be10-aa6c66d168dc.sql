DROP FUNCTION IF EXISTS public.get_menu_for_qr(text);
GRANT EXECUTE ON FUNCTION public.get_menu_for_qr(text, public.order_mode) TO anon, authenticated;