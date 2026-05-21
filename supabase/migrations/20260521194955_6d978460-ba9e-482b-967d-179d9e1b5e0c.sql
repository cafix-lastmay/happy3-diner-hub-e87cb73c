INSERT INTO public.marketers (user_id, ref_code, parent_ref_code, level, signup_type, name, language)
VALUES ('587a16a0-1bcb-472c-81bf-82efc465ff30', '10', NULL, 1, 'created_by_parent', 'Platform Owner', 'ar')
ON CONFLICT (ref_code) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, entity_ref_code)
VALUES ('587a16a0-1bcb-472c-81bf-82efc465ff30', 'owner', '10')
ON CONFLICT (user_id, role) DO UPDATE SET entity_ref_code = EXCLUDED.entity_ref_code;