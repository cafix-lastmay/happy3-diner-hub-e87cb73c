create extension if not exists pgcrypto;

do $$
declare
  v_id uuid := '00000000-0000-0000-0000-000000000007';
  v_email text := 'cafeadmin2@test2.com';
  v_pwd text := 'test531970';
  v_name text := 'Cafe Admin 2';
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, crypt(v_pwd, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v_name), now(), now(), '', '', '', '')
  on conflict (id) do update set encrypted_password = excluded.encrypted_password, email = excluded.email, email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()), raw_user_meta_data = excluded.raw_user_meta_data, updated_at = now();

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now())
  on conflict (provider, provider_id) do nothing;
end $$;

insert into public.profiles (id, full_name, email, language) values
  ('00000000-0000-0000-0000-000000000007', 'Cafe Admin 2', 'cafeadmin2@test2.com', 'ar')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role, entity_ref_code) values
  ('00000000-0000-0000-0000-000000000007', 'cafeteria_admin', 'C1002')
on conflict (user_id, role) do nothing;

update public.cafeterias
set user_id = '00000000-0000-0000-0000-000000000007'
where ref_code = 'C1002';