create extension if not exists pgcrypto;

do $$
declare
  v_users jsonb := jsonb_build_array(
    jsonb_build_object('id','00000000-0000-0000-0000-000000000001','email','yaserras@gmail.com',         'password','Kamel123321$',  'name','Platform Owner'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000002','email','marketer1@test.com',         'password','test531970',    'name','Marketer One'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000003','email','cafeadmin@test1.com',        'password','test531970',    'name','Cafe Admin'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000004','email','waiter.test@cafeteria.com',  'password','Test@123456',   'name','Waiter Test'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000005','email','chef2_caf1@test.com',        'password','test531970',    'name','Chef Hot Drinks'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000006','email','chiefsweet@test1.com',       'password','test531970',    'name','Chef Sweets')
  );
  u jsonb;
  v_id uuid; v_email text; v_pwd text; v_name text;
begin
  for u in select * from jsonb_array_elements(v_users) loop
    v_id := (u->>'id')::uuid; v_email := u->>'email'; v_pwd := u->>'password'; v_name := u->>'name';
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, crypt(v_pwd, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v_name), now(), now(), '', '', '', '')
    on conflict (id) do update set encrypted_password = excluded.encrypted_password, email = excluded.email, email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()), raw_user_meta_data = excluded.raw_user_meta_data, updated_at = now();
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now())
    on conflict (provider, provider_id) do nothing;
  end loop;
end $$;

insert into public.user_roles (user_id, role, entity_ref_code) values
  ('00000000-0000-0000-0000-000000000001', 'owner', '10'),
  ('00000000-0000-0000-0000-000000000002', 'marketer', '1001'),
  ('00000000-0000-0000-0000-000000000003', 'cafeteria_admin', 'C1001'),
  ('00000000-0000-0000-0000-000000000004', 'waiter', 'C1001'),
  ('00000000-0000-0000-0000-000000000005', 'chef', 'C1001'),
  ('00000000-0000-0000-0000-000000000006', 'chef', 'C1001')
on conflict (user_id, role) do nothing;

insert into public.profiles (id, full_name, email, language) values
  ('00000000-0000-0000-0000-000000000001', 'Platform Owner', 'yaserras@gmail.com', 'ar'),
  ('00000000-0000-0000-0000-000000000002', 'Marketer One', 'marketer1@test.com', 'ar'),
  ('00000000-0000-0000-0000-000000000003', 'Cafe Admin', 'cafeadmin@test1.com', 'ar'),
  ('00000000-0000-0000-0000-000000000004', 'Waiter Test', 'waiter.test@cafeteria.com', 'ar'),
  ('00000000-0000-0000-0000-000000000005', 'Chef Hot Drinks', 'chef2_caf1@test.com', 'ar'),
  ('00000000-0000-0000-0000-000000000006', 'Chef Sweets', 'chiefsweet@test1.com', 'ar')
on conflict (id) do nothing;

insert into public.marketers (id, user_id, ref_code, parent_ref_code, level, signup_type, name, language, is_active) values
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '10', null, 1, 'created_by_parent', 'Platform Owner', 'ar', true),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', '1001', '10', 2, 'created_by_parent', 'Marketer One', 'ar', true)
on conflict (ref_code) do nothing;

insert into public.cafeterias (id, user_id, ref_code, parent_ref_code, signup_type, name, language, mode_dine_in, mode_takeaway, mode_delivery, delivery_fee_a_name, delivery_fee_a_amount, delivery_fee_b_name, delivery_fee_b_amount, delivery_fee_c_name, delivery_fee_c_amount, is_active, free_trial_until) values
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','C1001','1001','created_by_parent','كافيتريا ياسر 1','ar',true,true,true,'توصيل قريب',5,'توصيل متوسط',10,'توصيل بعيد',15,true, now() + interval '21 days'),
  ('20000000-0000-0000-0000-000000000002',null,'C1002','1001','created_by_parent','كافيتريا ياسر 2','ar',true,false,false,null,0,null,0,null,0,true, now() + interval '21 days')
on conflict (ref_code) do nothing;

insert into public.staff (id, user_id, cafeteria_ref_code, role, is_active, shift_enabled) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'C1001', 'waiter', true, true),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'C1001', 'chef',   true, true),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'C1001', 'chef',   true, true)
on conflict (id) do nothing;

do $$
declare i int;
begin
  for i in 1..10 loop
    insert into public.restaurant_tables (id, cafeteria_ref_code, label, qr_token, is_active)
    values (('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,'C1001','طاولة ' || i,'seed-c1001-t' || lpad(i::text, 2, '0'),true)
    on conflict (id) do nothing;
  end loop;
  for i in 1..5 loop
    insert into public.restaurant_tables (id, cafeteria_ref_code, label, qr_token, is_active)
    values (('40000000-0000-0000-0000-1' || lpad(i::text, 11, '0'))::uuid,'C1002','طاولة ' || i,'seed-c1002-t' || lpad(i::text, 2, '0'),true)
    on conflict (id) do nothing;
  end loop;
end $$;

insert into public.menu_categories (id, cafeteria_ref_code, name, sort_order, is_active) values
  ('50000000-0000-0000-0000-000000000001', 'C1001', 'مشروبات ساخنة', 1, true),
  ('50000000-0000-0000-0000-000000000002', 'C1001', 'حلويات', 2, true)
on conflict (id) do nothing;

insert into public.menu_items (id, cafeteria_ref_code, category_id, name, price, sort_order, is_available) values
  ('60000000-0000-0000-0000-000000000001', 'C1001', '50000000-0000-0000-0000-000000000001', 'قهوة عربية', 15, 1, true),
  ('60000000-0000-0000-0000-000000000002', 'C1001', '50000000-0000-0000-0000-000000000001', 'شاي', 10, 2, true),
  ('60000000-0000-0000-0000-000000000003', 'C1001', '50000000-0000-0000-0000-000000000001', 'نسكافيه', 20, 3, true),
  ('60000000-0000-0000-0000-000000000004', 'C1001', '50000000-0000-0000-0000-000000000002', 'كيكة شوكولاتة', 25, 1, true),
  ('60000000-0000-0000-0000-000000000005', 'C1001', '50000000-0000-0000-0000-000000000002', 'بسكويت', 10, 2, true)
on conflict (id) do nothing;

insert into public.staff_scopes (id, staff_id, kind, ref_id) values
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'category', '50000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'category', '50000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

do $$
declare
  i int; v_order_id uuid; v_table_id uuid;
begin
  for i in 1..5 loop
    v_order_id := ('80000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    v_table_id := ('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.orders (id, cafeteria_ref_code, table_id, table_label, customer_name, mode, status, total, served_by, created_at)
    values (v_order_id, 'C1001', v_table_id, 'طاولة ' || i, 'عميل ' || i, 'dine_in', 'paid', 25, '00000000-0000-0000-0000-000000000004', now() - (i || ' hours')::interval)
    on conflict (id) do nothing;
    insert into public.order_items (id, order_id, item_id, name_snapshot, price_snapshot, qty) values
      (('81000000-0000-0000-0000-' || lpad((i*2-1)::text, 12, '0'))::uuid, v_order_id, '60000000-0000-0000-0000-000000000001', 'قهوة عربية', 15, 1),
      (('81000000-0000-0000-0000-' || lpad((i*2)::text,   12, '0'))::uuid, v_order_id, '60000000-0000-0000-0000-000000000002', 'شاي', 10, 1)
    on conflict (id) do nothing;
  end loop;
  for i in 6..8 loop
    v_order_id := ('80000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.orders (id, cafeteria_ref_code, table_label, customer_name, mode, status, total, served_by, created_at)
    values (v_order_id, 'C1001', 'TAKEAWAY', 'عميل ' || i, 'take_away', 'paid', 35, '00000000-0000-0000-0000-000000000004', now() - (i || ' hours')::interval)
    on conflict (id) do nothing;
    insert into public.order_items (id, order_id, item_id, name_snapshot, price_snapshot, qty) values
      (('82000000-0000-0000-0000-' || lpad((i*2-1)::text, 12, '0'))::uuid, v_order_id, '60000000-0000-0000-0000-000000000003', 'نسكافيه', 20, 1),
      (('82000000-0000-0000-0000-' || lpad((i*2)::text,   12, '0'))::uuid, v_order_id, '60000000-0000-0000-0000-000000000004', 'كيكة شوكولاتة', 25, 1)
    on conflict (id) do nothing;
  end loop;
  for i in 9..10 loop
    v_order_id := ('80000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    v_table_id := ('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.orders (id, cafeteria_ref_code, table_id, table_label, customer_name, mode, status, total, created_at)
    values (v_order_id, 'C1001', v_table_id, 'طاولة ' || i, 'عميل ' || i, 'dine_in', 'new', 15, now() - '10 minutes'::interval)
    on conflict (id) do nothing;
    insert into public.order_items (id, order_id, item_id, name_snapshot, price_snapshot, qty) values
      (('83000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, v_order_id, '60000000-0000-0000-0000-000000000001', 'قهوة عربية', 15, 1)
    on conflict (id) do nothing;
  end loop;
end $$;

insert into public.recharge_requests (id, cafeteria_ref_code, amount_usd, local_currency, exchange_rate_to_usd, points_to_credit, receipt_url, status, approved_by, approved_at, notes) values
  ('90000000-0000-0000-0000-000000000001', 'C1001', 50, 'EGP', 50, 2500, 'https://example.com/receipt1.jpg', 'approved', '00000000-0000-0000-0000-000000000001', now() - '2 days'::interval, 'Approved test recharge'),
  ('90000000-0000-0000-0000-000000000002', 'C1001', 100, 'EGP', 50, 5000, 'https://example.com/receipt2.jpg', 'pending', null, null, 'Awaiting review'),
  ('90000000-0000-0000-0000-000000000003', 'C1001', 30, 'EGP', 50, 1500, 'https://example.com/receipt3.jpg', 'rejected', '00000000-0000-0000-0000-000000000001', now() - '1 day'::interval, 'Receipt unclear')
on conflict (id) do nothing;

insert into public.commission_transactions (id, recharge_id, marketer_ref_code, source_cafeteria_ref_code, level_distance, percentage, amount_usd, status, released_at) values
  ('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','1001','C1001',1,10,5,'available', now() - '1 day'::interval)
on conflict (id) do nothing;

insert into public.shifts (id, cafeteria_ref_code, staff_user_id, staff_role, status, requested_at, approved_at, approved_by, closed_at, closed_by, orders_count, tips_total) values
  ('b0000000-0000-0000-0000-000000000001', 'C1001', '00000000-0000-0000-0000-000000000004', 'waiter', 'closed', now() - '1 day'::interval, now() - '1 day'::interval, '00000000-0000-0000-0000-000000000003', now() - '20 hours'::interval, '00000000-0000-0000-0000-000000000004', 8, 25),
  ('b0000000-0000-0000-0000-000000000002', 'C1001', '00000000-0000-0000-0000-000000000004', 'waiter', 'active', now() - '2 hours'::interval, now() - '2 hours'::interval, '00000000-0000-0000-0000-000000000003', null, null, 2, 0),
  ('b0000000-0000-0000-0000-000000000003', 'C1001', '00000000-0000-0000-0000-000000000005', 'chef', 'active', now() - '2 hours'::interval, now() - '2 hours'::interval, '00000000-0000-0000-0000-000000000003', null, null, 0, 0),
  ('b0000000-0000-0000-0000-000000000004', 'C1001', '00000000-0000-0000-0000-000000000006', 'chef', 'active', now() - '2 hours'::interval, now() - '2 hours'::interval, '00000000-0000-0000-0000-000000000003', null, null, 0, 0)
on conflict (id) do nothing;