
# Takeaway + Delivery Customer Ordering — Implementation Plan

Based on your answers, this plan reuses existing systems instead of duplicating them. **No new fee columns, no new price columns on menu_items, no new delivery infra** — only the wiring needed to expose Takeaway/Delivery to customers.

## What already exists (untouched)

- `cafeterias.mode_takeaway` / `mode_delivery` / `mode_dine_in` (3 modes)
- `cafeterias.takeaway_qr_token` (already auto-generated)
- `service_percent` + `tax_apply_takeaway` / `tax_apply_delivery` toggles
- `price_tiers` + `menu_item_prices` (full per-tier pricing system, used by `place_order`)
- `menu_mode_overrides` (per-mode price/visibility per item) — already honored by `place_order`
- Full delivery flow: `delivery_details` table, `assign_delivery_driver` / `respond_to_delivery` / `update_delivery_status` RPCs, `DriverDeliveries.tsx`, `DeliveryPanel.tsx`, `CustomerDeliveryTracker.tsx`, driver wallet
- `orders.mode` enum: `dine_in | takeaway | delivery`

## What's missing (this plan adds)

### 1. Migration

- Add column `cafeterias.delivery_qr_token TEXT UNIQUE` (auto-generated, backfilled for existing cafes)
- Extend `order_status` enum: add `pending_cashier_confirmation`, `ready_for_delivery`
- New SECURITY DEFINER RPCs:
  - `get_menu_for_takeaway(_token text)` → cafeteria, categories, items priced from Takeaway tier (+ mode_overrides)
  - `get_menu_for_delivery(_token text)` → same but Delivery tier
  - `place_order_takeaway(_token, _customer_name, _customer_phone, _notes, _items)` → creates order with `mode='takeaway'`, `status='pending_cashier_confirmation'`, no `table_id`
  - `place_order_delivery(_token, _customer_name, _customer_phone, _address, _lat, _lng, _notes, _items)` → creates order with `mode='delivery'`, `status='new'`, also inserts `delivery_details` row with status `pending_assignment` so existing `DeliveryPanel` can assign a driver
  - `confirm_takeaway_payment(_order_id)` → cafe admin/manager/staff; advances `pending_cashier_confirmation → paid` (triggers existing points deduction)
- Seed helper: for each cafeteria, if no price_tier with `name IN ('صالة','استلام','توصيل')` exists, create the missing ones. Existing default tier preserved.
- Reuse Phase 5 driver tracking; no schema changes to `delivery_details` or `drivers`.

### 2. Tables page (`/cafeteria/tables` + `/manager/tables`)

Add a new section **"QR الخدمات الأخرى"** above the dine-in tables grid (only shown when `mode_takeaway` / `mode_delivery` are enabled). Two cards:
- **Takeaway QR** → URL `${origin}/m/takeaway/${takeaway_qr_token}` · buttons: Print · Regenerate · Copy
- **Delivery QR** → URL `${origin}/m/delivery/${delivery_qr_token}` · buttons: Print · Regenerate · Copy

Regenerate writes a new UUID via `crypto.randomUUID().replace(/-/g, '')`.

### 3. New customer routes

- `src/routes/m.takeaway.$token.tsx` — fork of `m.$qrToken.tsx`:
  - Calls `get_menu_for_takeaway`
  - Name + Phone required, no table label
  - On submit → `place_order_takeaway`
  - Confirmation screen: "تم استلام طلبك. رقم الطلب #XXXXX. يرجى التوجه للكاشير لتأكيد الدفع."
- `src/routes/m.delivery.$token.tsx` — fork of takeaway:
  - Calls `get_menu_for_delivery`
  - Additional Address (textarea) + optional "use my location" GPS
  - On submit → `place_order_delivery` (writes delivery_details with `pending_assignment`)
  - Confirmation: order number + link to existing `CustomerDeliveryTracker` at `/order/$orderId/track`

Both pages share extracted bits from `m.$qrToken.tsx` to avoid full duplication (cart, item card, search, categories carousel). Reuse `PromoBanner`, `LanguageSwitcher`.

### 4. Staff orders (`/cafeteria/orders`, `/manager/`, `/staff/orders`)

- Add tabs row: الكل / الصالة / استلام / توصيل (filters by `orders.mode`)
- For `mode='takeaway'` + `status='pending_cashier_confirmation'`: show "تأكيد الدفع" button → calls `confirm_takeaway_payment`. After confirmation, normal flow takes over.
- For `mode='delivery'`: the existing `DeliveryPanel` already handles assignment; just ensure it surfaces in the orders board for delivery rows. No driver dashboard changes needed (Phase 5 system handles pickup → on_the_way → delivered).

### 5. i18n

Add Arabic/English strings for: order modes filter tabs, takeaway/delivery QR card titles, confirmation screen, "confirm payment" button, "QR الخدمات الأخرى", validation errors.

## Files

```text
supabase/migrations/<new>.sql                   NEW
src/routes/m.takeaway.$token.tsx                NEW
src/routes/m.delivery.$token.tsx                NEW
src/components/customer/CustomerMenuShared.tsx  NEW (extracted cart/items/search)
src/routes/cafeteria.tables.tsx                 EDIT (add OtherServicesQr section)
src/routes/cafeteria.orders.tsx                 EDIT (mode tabs + cashier confirm button)
src/routes/staff.orders.tsx                     EDIT (same tabs)
src/i18n/ar.ts, src/i18n/en.ts                  EDIT
src/integrations/supabase/types.ts              AUTO-REGENERATED (don't touch)
```

## What I will NOT do (per your answers)

- ❌ Add `dine_in_price/takeaway_price/delivery_price` columns to `menu_items` (use price_tiers instead)
- ❌ Add `service_fee_dine_in/takeaway/delivery` columns (keep service_percent + apply toggles)
- ❌ Add `delivery_base_fee` / `delivery_fee_per_km` (existing tiered A/B/C fees stay)
- ❌ Replace `delivery_details` with `assigned_driver_id` on orders
- ❌ Add 70/30 driver split (existing wallet system stays)
- ❌ Rebuild DriverDeliveries / DeliveryPanel
- ❌ Add separate "delivery distance" entry (existing fee tiers cover this)

## Open questions

1. **Default tier names**: I'll seed `صالة` / `استلام` / `توصيل` as three tiers per cafeteria (`صالة` marked default). Items will use existing tier prices; if no per-tier override exists, `menu_items.price` is used (current `place_order` behavior). Is this OK, or do you want different tier names?
2. **Delivery fee on customer page**: The Phase 5 model assigns a fee tier (A/B/C) only at waiter assignment, not at customer checkout. So the customer's delivery order will show "Subtotal + Service" only — the delivery fee gets added once the waiter assigns a driver/tier. Acceptable, or should the customer pick A/B/C up front?

After you confirm (or answer the 2 questions), I'll implement in this order: migration → tables page QR cards → takeaway customer page → delivery customer page → staff orders tabs + confirm button → i18n.
