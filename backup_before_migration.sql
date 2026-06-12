-- Backup generated 2026-06-12T13:04:48.032919Z
-- Source project: xcouhvtmrrnnzkfjfaaz
-- Contains: public.* tables (INSERTs) + auth.users (id,email,created_at)

BEGIN;

-- ============ public.app_settings (1 rows) ============
INSERT INTO public."app_settings" ("id", "default_trial_days", "updated_at", "updated_by", "footer_banner_text", "footer_banner_cta_text", "footer_banner_url", "footer_banner_enabled", "max_driver_radius_km", "points_per_usd", "grace_days_after_zero", "commission_eligibility_months") VALUES (true, 0, '2026-05-27T12:21:21.336966+00:00'::timestamptz, '587a16a0-1bcb-472c-81bf-82efc465ff30', 'شركه عمار حبيب بابا لإدارة الأعمال الذكيه', 'واتساب', 'https://wa.me/201064260969', true, 5, 200, 3, 24);

-- ============ public.cafeteria_payment_info (1 rows) ============
INSERT INTO public."cafeteria_payment_info" ("cafeteria_ref_code", "bank_details", "payment_instructions", "updated_at", "created_at") VALUES ('10B01', NULL, 'الدفع كاش عند وصول المندوب', '2026-06-11T20:44:28.825369+00:00'::timestamptz, '2026-05-22T13:04:20.978237+00:00'::timestamptz);

-- ============ public.cafeterias (5 rows) ============
