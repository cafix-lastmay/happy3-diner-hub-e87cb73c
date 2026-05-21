-- =====================================================================
-- Comprehensive Test Seed Script
-- ---------------------------------------------------------------------
-- Idempotent: safe to run multiple times. Designed for `supabase db seed`
-- or `psql -f supabase/seed.sql` against a fresh Supabase instance.
--
-- Creates: test auth users, owner/marketer/cafeteria_admin/waiter/chefs,
-- 2 cafeterias, menu (categories + items), tables, orders, shifts,
-- recharge requests, and a commission entry.
--
-- All UUIDs are fixed so re-runs don't create duplicates.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) TEST AUTH USERS
-- ---------------------------------------------------------------------
-- Helper to upsert a confirmed user with a known UUID + password.
do $$
declare
  v_users jsonb := jsonb_build_array(
    jsonb_build_object('id','00000000-0000-0000-0000-000000000001','email','yaserras@gmail.com',         'password','Kamel123321$',  'name','Platform Owner'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000002','email','marketer1@test.com',         'password','test531970',    'name','Marketer One'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000003','email','cafeadmin@test1.com',        'password','test531970',    'name','Cafe Admin'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000004','email','waiter.test@cafeteria.com',  'password','Test@123456',   'name','Waiter Test'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000005','email','chef2_caf1@test.com',        'password','test531970',    'name','Chef Hot Drinks'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000006','email','chiefsweet@test1.com',       'password','test531970',    'name','Chef Sweets'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000007','email','cafeadmin2@test2.com',       'password','test531970',    'name','Cafe Admin 2'),
    jsonb_build_object('id','00000000-0000-0000-0000-000000000008','email','testdriver@test.com',        'password','test531970',    'name','Test Driver')
  );
  u jsonb;
  v_id uuid;
  v_email text;
  v_pwd text;
  v_name text;
begin
  for u in select * from jsonb_array_elements(v_users) loop
    v_id    := (u->>'id')::uuid;
    v_email := u->>'email';
    v_pwd   := u->>'password';
    v_name  := u->>'name';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, crypt(v_pwd, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      now(), now(), '', '', '', ''
    )
    on conflict (id) do update
      set encrypted_password = excluded.encrypted_password,
          email              = excluded.email,
          email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
          raw_user_meta_data = excluded.raw_user_meta_data,
          updated_at         = now();

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    )
    on conflict (provider, provider_id) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) USER ROLES  (roles live in a dedicated table — never on profiles)
-- ---------------------------------------------------------------------
insert into public.user_roles (user_id, role, entity_ref_code) values
  ('00000000-0000-0000-0000-000000000001', 'owner',           '10'),
  ('00000000-0000-0000-0000-000000000002', 'marketer',        '1001'),
  ('00000000-0000-0000-0000-000000000003', 'cafeteria_admin', 'C1001'),
  ('00000000-0000-0000-0000-000000000004', 'waiter',          'C1001'),
  ('00000000-0000-0000-0000-000000000005', 'chef',            'C1001'),
  ('00000000-0000-0000-0000-000000000006', 'chef',            'C1001'),
  ('00000000-0000-0000-0000-000000000007', 'cafeteria_admin', 'C1002'),
  ('00000000-0000-0000-0000-000000000008', 'driver',          null)
on conflict (user_id, role) do nothing;

-- ---------------------------------------------------------------------
-- 3) PROFILES
-- ---------------------------------------------------------------------
insert into public.profiles (id, full_name, email, language) values
  ('00000000-0000-0000-0000-000000000001', 'Platform Owner',   'yaserras@gmail.com',         'ar'),
  ('00000000-0000-0000-0000-000000000002', 'Marketer One',     'marketer1@test.com',         'ar'),
  ('00000000-0000-0000-0000-000000000003', 'Cafe Admin',       'cafeadmin@test1.com',        'ar'),
  ('00000000-0000-0000-0000-000000000004', 'Waiter Test',      'waiter.test@cafeteria.com',  'ar'),
  ('00000000-0000-0000-0000-000000000005', 'Chef Hot Drinks',  'chef2_caf1@test.com',        'ar'),
  ('00000000-0000-0000-0000-000000000006', 'Chef Sweets',      'chiefsweet@test1.com',       'ar'),
  ('00000000-0000-0000-0000-000000000007', 'Cafe Admin 2',     'cafeadmin2@test2.com',       'ar'),
  ('00000000-0000-0000-0000-000000000008', 'Test Driver',      'testdriver@test.com',        'ar')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4) MARKETERS (owner=ref 10, marketer1=ref 1001 under owner)
-- ---------------------------------------------------------------------
insert into public.marketers (id, user_id, ref_code, parent_ref_code, level, signup_type, name, language, is_active)
values
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '10',   null, 1, 'created_by_parent', 'Platform Owner', 'ar', true),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', '1001', '10', 2, 'created_by_parent', 'Marketer One',   'ar', true)
on conflict (ref_code) do nothing;

-- ---------------------------------------------------------------------
-- 5) CAFETERIAS
--   C1001: dine_in + takeaway + delivery, 10 tables, 3 delivery tiers
--   C1002: dine_in only, 5 tables
-- ---------------------------------------------------------------------
insert into public.cafeterias (
  id, user_id, ref_code, parent_ref_code, signup_type, name, language,
  mode_dine_in, mode_takeaway, mode_delivery,
  delivery_fee_a_name, delivery_fee_a_amount,
  delivery_fee_b_name, delivery_fee_b_amount,
  delivery_fee_c_name, delivery_fee_c_amount,
  is_active, free_trial_until
) values
  ('20000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003',
   'C1001', '1001', 'created_by_parent', 'كافيتريا ياسر 1', 'ar',
   true, true, true,
   'توصيل قريب', 5,
   'توصيل متوسط', 10,
   'توصيل بعيد', 15,
   true, now() + interval '21 days'),
  ('20000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000007',
   'C1002', '1001', 'created_by_parent', 'كافيتريا ياسر 2', 'ar',
   true, false, false,
   null, 0, null, 0, null, 0,
   true, now() + interval '21 days')
on conflict (ref_code) do nothing;

-- ---------------------------------------------------------------------
-- 6) STAFF for Cafeteria 1 (waiter + 2 chefs)
-- ---------------------------------------------------------------------
insert into public.staff (id, user_id, cafeteria_ref_code, role, is_active, shift_enabled) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'C1001', 'waiter', true, true),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'C1001', 'chef',   true, true),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', 'C1001', 'chef',   true, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 7) TABLES: 10 for cafe 1, 5 for cafe 2
-- ---------------------------------------------------------------------
do $$
declare i int;
begin
  for i in 1..10 loop
    insert into public.restaurant_tables (id, cafeteria_ref_code, label, qr_token, is_active)
    values (
      ('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
      'C1001', 'طاولة ' || i,
      'seed-c1001-t' || lpad(i::text, 2, '0'),
      true
    )
    on conflict (id) do nothing;
  end loop;

  for i in 1..5 loop
    insert into public.restaurant_tables (id, cafeteria_ref_code, label, qr_token, is_active)
    values (
      ('40000000-0000-0000-0000-1' || lpad(i::text, 11, '0'))::uuid,
      'C1002', 'طاولة ' || i,
      'seed-c1002-t' || lpad(i::text, 2, '0'),
      true
    )
    on conflict (id) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8) MENU for Cafeteria 1
--    Category: مشروبات ساخنة  + Category: حلويات
-- ---------------------------------------------------------------------
insert into public.menu_categories (id, cafeteria_ref_code, name, sort_order, is_active) values
  ('50000000-0000-0000-0000-000000000001', 'C1001', 'مشروبات ساخنة', 1, true),
  ('50000000-0000-0000-0000-000000000002', 'C1001', 'حلويات',        2, true)
on conflict (id) do nothing;

insert into public.menu_items (id, cafeteria_ref_code, category_id, name, price, sort_order, is_available) values
  -- Hot drinks (chef: chef2_caf1)
  ('60000000-0000-0000-0000-000000000001', 'C1001', '50000000-0000-0000-0000-000000000001', 'قهوة عربية', 15, 1, true),
  ('60000000-0000-0000-0000-000000000002', 'C1001', '50000000-0000-0000-0000-000000000001', 'شاي',        10, 2, true),
  ('60000000-0000-0000-0000-000000000003', 'C1001', '50000000-0000-0000-0000-000000000001', 'نسكافيه',    20, 3, true),
  -- Sweets (chef: chiefsweet)
  ('60000000-0000-0000-0000-000000000004', 'C1001', '50000000-0000-0000-0000-000000000002', 'كيكة شوكولاتة', 25, 1, true),
  ('60000000-0000-0000-0000-000000000005', 'C1001', '50000000-0000-0000-0000-000000000002', 'بسكويت',         10, 2, true)
on conflict (id) do nothing;

-- Assign chefs to categories via staff_scopes
insert into public.staff_scopes (id, staff_id, kind, ref_id) values
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'category', '50000000-0000-0000-0000-000000000001'), -- hot drinks → chef2_caf1
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'category', '50000000-0000-0000-0000-000000000002')  -- sweets    → chiefsweet
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 9) SAMPLE ORDERS  (5 dine_in paid, 3 take_away paid, 2 pending new)
-- ---------------------------------------------------------------------
do $$
declare
  i int;
  v_order_id uuid;
  v_table_id uuid;
begin
  -- 5 completed dine_in
  for i in 1..5 loop
    v_order_id := ('80000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    v_table_id := ('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.orders (id, cafeteria_ref_code, table_id, table_label, customer_name, mode, status, total, served_by, created_at)
    values (v_order_id, 'C1001', v_table_id, 'طاولة ' || i, 'عميل ' || i, 'dine_in', 'paid', 25,
            '00000000-0000-0000-0000-000000000004', now() - (i || ' hours')::interval)
    on conflict (id) do nothing;

    insert into public.order_items (id, order_id, item_id, name_snapshot, price_snapshot, qty) values
      (('81000000-0000-0000-0000-' || lpad((i*2-1)::text, 12, '0'))::uuid, v_order_id, '60000000-0000-0000-0000-000000000001', 'قهوة عربية', 15, 1),
      (('81000000-0000-0000-0000-' || lpad((i*2)::text,   12, '0'))::uuid, v_order_id, '60000000-0000-0000-0000-000000000002', 'شاي',        10, 1)
    on conflict (id) do nothing;
  end loop;

  -- 3 completed take_away
  for i in 6..8 loop
    v_order_id := ('80000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.orders (id, cafeteria_ref_code, table_label, customer_name, mode, status, total, served_by, created_at)
    values (v_order_id, 'C1001', 'TAKEAWAY', 'عميل ' || i, 'take_away', 'paid', 35,
            '00000000-0000-0000-0000-000000000004', now() - (i || ' hours')::interval)
    on conflict (id) do nothing;

    insert into public.order_items (id, order_id, item_id, name_snapshot, price_snapshot, qty) values
      (('82000000-0000-0000-0000-' || lpad((i*2-1)::text, 12, '0'))::uuid, v_order_id, '60000000-0000-0000-0000-000000000003', 'نسكافيه',     20, 1),
      (('82000000-0000-0000-0000-' || lpad((i*2)::text,   12, '0'))::uuid, v_order_id, '60000000-0000-0000-0000-000000000004', 'كيكة شوكولاتة', 25, 1)
    on conflict (id) do nothing;
  end loop;

  -- 2 pending
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

-- ---------------------------------------------------------------------
-- 10) RECHARGE REQUESTS (1 approved, 1 pending, 1 rejected)
-- ---------------------------------------------------------------------
insert into public.recharge_requests (id, cafeteria_ref_code, amount_usd, local_currency, exchange_rate_to_usd, points_to_credit, receipt_url, status, approved_by, approved_at, notes)
values
  ('90000000-0000-0000-0000-000000000001', 'C1001', 50,  'EGP', 50,  2500, 'https://example.com/receipt1.jpg', 'approved', '00000000-0000-0000-0000-000000000001', now() - '2 days'::interval, 'Approved test recharge'),
  ('90000000-0000-0000-0000-000000000002', 'C1001', 100, 'EGP', 50,  5000, 'https://example.com/receipt2.jpg', 'pending',  null, null, 'Awaiting review'),
  ('90000000-0000-0000-0000-000000000003', 'C1001', 30,  'EGP', 50,  1500, 'https://example.com/receipt3.jpg', 'rejected', '00000000-0000-0000-0000-000000000001', now() - '1 day'::interval, 'Receipt unclear')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 11) COMMISSION TRANSACTIONS (marketer1 commission from approved recharge)
-- ---------------------------------------------------------------------
insert into public.commission_transactions (id, recharge_id, marketer_ref_code, source_cafeteria_ref_code, level_distance, percentage, amount_usd, status, released_at)
values
  ('a0000000-0000-0000-0000-000000000001',
   '90000000-0000-0000-0000-000000000001',
   '1001', 'C1001', 1, 10, 5, 'available', now() - '1 day'::interval)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 12) SHIFTS for waiter + chefs (1 closed, 1 active each)
-- ---------------------------------------------------------------------
insert into public.shifts (id, cafeteria_ref_code, staff_user_id, staff_role, status, requested_at, approved_at, approved_by, closed_at, closed_by, orders_count, tips_total) values
  ('b0000000-0000-0000-0000-000000000001', 'C1001', '00000000-0000-0000-0000-000000000004', 'waiter', 'closed', now() - '1 day'::interval,    now() - '1 day'::interval,    '00000000-0000-0000-0000-000000000003', now() - '20 hours'::interval, '00000000-0000-0000-0000-000000000004', 8, 25),
  ('b0000000-0000-0000-0000-000000000002', 'C1001', '00000000-0000-0000-0000-000000000004', 'waiter', 'active', now() - '2 hours'::interval,  now() - '2 hours'::interval,  '00000000-0000-0000-0000-000000000003', null, null, 2, 0),
  ('b0000000-0000-0000-0000-000000000003', 'C1001', '00000000-0000-0000-0000-000000000005', 'chef',   'active', now() - '2 hours'::interval,  now() - '2 hours'::interval,  '00000000-0000-0000-0000-000000000003', null, null, 0, 0),
  ('b0000000-0000-0000-0000-000000000004', 'C1001', '00000000-0000-0000-0000-000000000006', 'chef',   'active', now() - '2 hours'::interval,  now() - '2 hours'::interval,  '00000000-0000-0000-0000-000000000003', null, null, 0, 0)
on conflict (id) do nothing;

-- =====================================================================
-- DONE. Login credentials:
--   Owner:           yaserras@gmail.com         / Kamel123321$
--   Marketer:        marketer1@test.com         / test531970
--   Cafe Admin:      cafeadmin@test1.com        / test531970
--   Waiter:          waiter.test@cafeteria.com  / Test@123456
--   Chef (drinks):   chef2_caf1@test.com        / test531970
--   Chef (sweets):   chiefsweet@test1.com       / test531970
-- =====================================================================

-- ---------------------------------------------------------------------
-- 13) TEST DRIVER (independent, approved-linked to C1001, Cairo home)
-- ---------------------------------------------------------------------
insert into public.drivers (
  id, user_id, kind, full_name, phone, vehicle_type,
  service_radius_km, home_lat, home_lng, status, is_active
) values (
  'c0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000008',
  'independent', 'Test Driver', '+201000000000', 'motorcycle',
  10, 30.0444, 31.2357, 'available', true
)
on conflict (id) do nothing;

insert into public.driver_cafeteria_links (
  id, driver_id, cafeteria_ref_code, status, decided_at, decided_by
) values (
  'c1000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'C1001', 'approved', now(),
  '00000000-0000-0000-0000-000000000003'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 14) CLEANUP stale delivery_details for the test driver (badge bug fix)
-- ---------------------------------------------------------------------
delete from public.delivery_details
where driver_id = 'c0000000-0000-0000-0000-000000000001'
  and order_id <> 'd0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------
-- 15) TEST DELIVERY ORDER (pending_assignment for C1001)
--     Use direct insert (bypasses RPC) so it's reproducible.
-- ---------------------------------------------------------------------
insert into public.orders (
  id, cafeteria_ref_code, table_label, customer_name, customer_phone,
  mode, status, total, notes, created_at
) values (
  'd0000000-0000-0000-0000-000000000001',
  'C1001', 'DLV-TEST', 'Test Customer', '01234567890',
  'delivery', 'awaiting_payment', 10, 'Seed delivery test order', now()
) on conflict (id) do update set
  status = 'awaiting_payment', total = 10, updated_at = now();

insert into public.order_items (id, order_id, item_id, name_snapshot, price_snapshot, qty)
values (
  'd1000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000002',
  'شاي', 10, 1
) on conflict (id) do nothing;

insert into public.delivery_details (
  order_id, cafeteria_ref_code, customer_name, customer_phone,
  customer_address, status, fee_amount
) values (
  'd0000000-0000-0000-0000-000000000001',
  'C1001', 'Test Customer', '01234567890',
  'شارع التحرير، القاهرة', 'pending_assignment', 0
) on conflict (order_id) do update set
  status = 'pending_assignment',
  driver_id = null,
  fee_tier = null,
  fee_amount = 0,
  customer_address = excluded.customer_address,
  updated_at = now();

-- Phase 6 sample wallet entries + ratings for testdriver under C1001
INSERT INTO public.driver_wallet_entries
  (driver_id, order_id, cafeteria_ref_code, collected_from_customer, delivery_fee_earned, owed_to_cafeteria, owed_to_driver, settlement_status, settled_at)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'::uuid, 'C1001', 50.00, 15.00, 35.00, 15.00, 'pending', NULL),
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002'::uuid, 'C1001', 80.00, 20.00, 60.00, 20.00, 'paid', now() - interval '2 days')
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO public.ratings (target_kind, target_ref, order_id, customer_phone, stars, comment)
VALUES
  ('driver',    'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002'::uuid, '01234567890', 5, 'سائق ممتاز'),
  ('cafeteria', 'C1001',                                'e0000000-0000-0000-0000-000000000002'::uuid, '01234567890', 4, 'طعام جيد')
ON CONFLICT (order_id, target_kind) DO NOTHING;
