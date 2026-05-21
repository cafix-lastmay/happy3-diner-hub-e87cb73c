REVOKE ALL ON FUNCTION public.notify_chef_on_new_order_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_chef_on_new_order_item() FROM anon;
REVOKE ALL ON FUNCTION public.notify_chef_on_new_order_item() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notify_chef_on_new_order_item() TO service_role;