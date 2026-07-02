
REVOKE EXECUTE ON FUNCTION public.get_effective_daily_cap(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_daily_points_cap_status(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_list_daily_caps() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_upsert_daily_cap(uuid,text,integer,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owner_delete_daily_cap(uuid) FROM PUBLIC, anon;
