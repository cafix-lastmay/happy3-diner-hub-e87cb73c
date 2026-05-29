# Plan: 3 UX & Auth Changes

## Change 1 — Clean landing page (`src/routes/index.tsx`)

Remove from the homepage:
- The chip/banner: *"منصة إدارة الكافيتيريات والمطاعم مع نظام تسويق هرمي ذكي"* (the small pill above the H1).
- The 3 feature cards section ("نظام أكواد ذكي", "عمولات هرمية تلقائية", "متعدد العملات والبلدان").

Keep: header, QR scanner hero, partner login/signup card, footer.

Files: `src/routes/index.tsx` only.

---

## Change 2 — "Change password" for every role

A `/settings/account` page already exists and is shared. Add a **Change Password** card there (instead of duplicating in 6 places), then make sure every role's dashboard has a visible link to it.

### New card on `src/routes/settings.account.tsx`
Form fields:
- كلمة المرور الحالية
- كلمة المرور الجديدة (min 6 chars)
- تأكيد كلمة المرور الجديدة

Flow:
1. Re-authenticate: `supabase.auth.signInWithPassword({ email: user.email, password: current })`.
2. If success: `supabase.auth.updateUser({ password: newPassword })`.
3. Toast success / error, clear fields.

### Add navigation links to `/settings/account`
- Marketer: `src/routes/marketer.index.tsx` (or marketer nav) — add link in account/profile area.
- Cafeteria admin: `src/routes/cafeteria.settings.tsx` — add link.
- Manager: `src/routes/manager.settings.tsx` (re-uses cafeteria.settings) — covered automatically.
- Staff (waiter/chef): add a small "حسابي" section/link in `src/routes/staff.orders.tsx` header or a new `staff.settings` route entry.
- Driver: `src/routes/driver.index.tsx` "حسابي" tab — add link.

No new i18n strings file changes beyond keys for the new card.

---

## Change 3 — Order page customer fields

### Dine-in (`src/routes/t.$qrToken.tsx` and `src/routes/m.$qrToken.tsx`)
- Remove phone input + validation + display.
- Keep only customer name (optional, as today).
- Pass `_customer_phone: null` to `place_order` RPC.

### Takeaway (`src/components/customer/TakeawayDeliveryMenu.tsx` when `mode="take_away"`)
- Remove phone input + validation for takeaway mode only.
- Keep name only.

### Delivery (`mode="delivery"` in `TakeawayDeliveryMenu.tsx`)

Add customer authentication and saved-addresses:

**Behavior:**
- If `supabase.auth.getUser()` returns no session → show a "تسجيل الدخول / إنشاء حساب" gate (email + password, with toggle to sign up). Block "Place order" until logged in.
- If logged in:
  - Load addresses for this user from new `customer_addresses` table.
  - Pre-fill name/phone from `profiles` (existing table has `full_name`, `phone`).
  - Render an address selector listing saved addresses; default address pre-selected.
  - "إضافة عنوان جديد" expands the existing address/map fields and saves a new row on order.
  - "تعيين كافتراضي" toggle on each address.
- After a successful delivery order: upsert the used address (set as default if first one).

**Database (new migration):**

```sql
CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text,
  address text NOT NULL,
  lat numeric,
  lng numeric,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User manages own addresses" ON public.customer_addresses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger to ensure only one default per user
CREATE FUNCTION public.enforce_single_default_address() ...
```

Profiles row is auto-created today; we'll keep using it for name/phone.

**`place_order` RPC**: already accepts `_customer_phone` as nullable; for delivery we'll still pass it (from profile or saved address).

---

## Out of scope
- No styling/design overhaul of dashboards beyond adding the password card + links.
- No change to `place_order` RPC signature.
- No customer "order history" page (only saved addresses).

## Files touched (summary)
- `src/routes/index.tsx` — remove 2 sections.
- `src/routes/settings.account.tsx` — add Change Password card.
- `src/routes/cafeteria.settings.tsx`, `src/routes/marketer.index.tsx`, `src/routes/driver.index.tsx`, staff settings entry — add link to `/settings/account`.
- `src/routes/t.$qrToken.tsx`, `src/routes/m.$qrToken.tsx` — strip phone.
- `src/components/customer/TakeawayDeliveryMenu.tsx` — strip phone for takeaway; add auth gate + address selector for delivery.
- New migration: `customer_addresses` table + RLS + default-address trigger.
- `src/i18n/ar.ts` + `en.ts` — new strings.

Approve and I'll execute in this order: migration → frontend changes.
