# Phase 5 — Delivery Order Flow

## Goals
End-to-end delivery for orders where `orders.mode = 'delivery'`: capture customer address, let waiter assign a driver + fee tier, let driver accept/reject, track status through to delivery, and notify all three parties in realtime.

## 1. Database

### New table `delivery_details` (one row per delivery order)
- `order_id` (PK, FK → orders.id, ON DELETE CASCADE)
- `cafeteria_ref_code` text (denormalised for RLS speed)
- `customer_name`, `customer_phone`, `customer_address` text
- `customer_lat`, `customer_lng` numeric (nullable, optional GPS)
- `fee_tier` enum `delivery_fee_tier` (`a` | `b` | `c`)
- `fee_amount` numeric (snapshot from cafeteria at assignment)
- `driver_id` uuid (FK → drivers.id, nullable until assigned)
- `assigned_by` uuid (waiter user_id)
- `status` enum `delivery_status` — `pending_assignment` → `requested` → `accepted` | `rejected` → `picked_up` → `on_the_way` → `delivered` (+ `cancelled`)
- `requested_at`, `responded_at`, `picked_up_at`, `delivered_at`, `cancelled_at` timestamps
- `reject_reason` text nullable
- Standard `created_at` / `updated_at` + `update_updated_at` trigger
- Add to `supabase_realtime` publication

### RLS policies (using existing helpers)
- Customer reads its own delivery via QR-style public token? → defer; use order_id lookup with no auth from a public route.
- Cafe admin/manager (`is_cafe_admin_or_manager(cafeteria_ref_code)`) — full read/update.
- Waiter staff scoped to same cafeteria — read + insert (assignment) + update status.
- Driver — read where `driver_id = get_my_driver_id()`; update status when assigned and accepted.
- Owner — read all.

### RPCs (SECURITY DEFINER) — keeps business rules server-side
- `assign_delivery_driver(p_order_id, p_driver_id, p_fee_tier)` — waiter only. Validates order belongs to caller's cafeteria, mode='delivery', driver linked to cafeteria & available. Inserts/updates delivery_details, snapshots fee_amount from cafeterias, status → `requested`, sets `requested_at`. Creates notification for driver.
- `respond_to_delivery(p_order_id, p_accept, p_reason)` — driver only. If accept: status → `accepted`, `responded_at = now()`. If reject: status → `rejected`, store reason, clear driver_id so waiter can reassign. Notifies waiter + cafe admin.
- `update_delivery_status(p_order_id, p_status)` — driver only, advances `accepted → picked_up → on_the_way → delivered`. On delivered, sets order status via existing trigger path (or directly updates orders.status to 'paid' if business rule). Notifies customer + cafe.
- `cancel_delivery(p_order_id, p_reason)` — cafe admin/waiter, allowed pre-pickup.

### Driver status side-effects
- On accept: set `drivers.status = 'busy'`.
- On delivered/cancelled: set `drivers.status = 'available'`.

## 2. Server functions (`src/lib/delivery.functions.ts`)
All wrapped with `requireSupabaseAuth`, Zod-validated:
- `getDeliveryForOrder(orderId)` — returns delivery_details + joined driver (name, phone, photo, rating, current_lat/lng) and customer fields.
- `listAvailableDriversForCafeteria()` — for waiter assign dialog. Returns drivers linked & status='available', sorted by `rating_avg desc`. (Distance sort deferred — needs cafeteria coords; sort by rating for now and show distance when both coords exist.)
- `assignDriver({orderId, driverId, feeTier})` → RPC.
- `respondToDelivery({orderId, accept, reason?})` → RPC.
- `updateDeliveryStatus({orderId, status})` → RPC.
- `cancelDelivery({orderId, reason?})` → RPC.
- `getMyActiveDeliveries()` — driver dashboard list.
- `getCustomerDeliveryView(orderId)` — admin-elevated public read for customer order-status page (no PII of other parties beyond driver public fields).

## 3. UI

### Waiter — order detail (existing) gets a "Delivery" panel
Visible when `order.mode === 'delivery'`:
- Customer name/phone/address (entered at checkout — extend existing checkout form, see §4).
- "Assign driver" dialog: fee tier radio (A/B/C with prices from cafeteria), list of available drivers with rating + photo + accept button.
- Once assigned: shows driver card + status timeline + "Cancel delivery" button (pre-pickup).

### Driver — `/driver` dashboard (existing) gets two tabs
- **Incoming requests** — deliveries with status=`requested` & driver_id=me. Each card shows customer name + address + fee. Accept / Reject buttons (Reject opens reason modal). Auto-expires UI display after 2 min (just visual; server doesn't enforce yet).
- **Active delivery** — current accepted/picked_up/on_the_way row. Buttons advance to next status. Shows customer phone + address + map link (`https://www.google.com/maps?q={lat},{lng}` or address).

### Customer — `/order/$orderId/track` (new public route)
- Shows order summary + delivery status timeline.
- After driver accepts: shows driver name, photo, phone (tel: link), vehicle, ETA estimate (cafeteria.estimated_delivery_minutes from `accepted_at`).
- Polls every 15s (or realtime subscribe with anon — uses RLS public read by token; simplest: server fn fetched via TanStack Query refetchInterval).
- Link to this page is given to the customer at checkout submission.

### Checkout (customer) — extend existing delivery checkout
- Require name + phone + address (Zod-validated). Optional "use my location" → fills lat/lng via `navigator.geolocation`.
- On submit, create delivery_details row alongside order (extend existing `place_order` RPC OR insert delivery_details immediately after order creation via server fn).

## 4. Realtime notifications
- Existing `notifications` table + `postgres_changes` subscription pattern (per memory).
- Insert notifications inside each RPC: kind values `delivery_requested`, `delivery_accepted`, `delivery_rejected`, `delivery_status_changed`, `delivery_cancelled`. `data` JSONB includes `order_id`, `cafeteria_ref_code`, `status`.
- Driver and waiter dashboards subscribe (already established pattern for orders/shifts).
- Customer page polls (no auth, can't subscribe to RLS-gated channel).

## 5. i18n
Add Arabic + English strings for all new labels, statuses, and toast messages in `src/i18n/ar.ts` + `src/i18n/en.ts`.

## 6. Out of scope (deferred)
- Live GPS tracking on map for customer (requires Mapbox/Google key + driver location ping job) — basic ETA only.
- Auto-expiry of unaccepted requests after 2 min (UI hint only; cron later).
- Distance-based driver sort (needs cafeteria coords reliably populated).
- Driver rating after delivery — separate phase.

## Files to add / change

```text
supabase migration (schema + RLS + RPCs + realtime publication)
src/lib/delivery.functions.ts                NEW
src/lib/schemas/delivery.ts                  NEW (zod)
src/routes/order.$orderId.track.tsx          NEW (public customer tracking)
src/routes/_authenticated/driver/index.tsx   EDIT (tabs + active delivery card)
src/components/delivery/AssignDriverDialog.tsx NEW
src/components/delivery/DeliveryPanel.tsx    NEW (waiter view inside order detail)
src/components/delivery/StatusTimeline.tsx   NEW
src/components/delivery/DriverCard.tsx       NEW
src/routes/_authenticated/waiter/orders.$id.tsx EDIT (mount DeliveryPanel)
src/routes/checkout/delivery flow            EDIT (capture address + GPS)
src/i18n/ar.ts, src/i18n/en.ts               EDIT
```

## Order of work
1. Migration (table, enums, RLS, RPCs, realtime publication).
2. Server functions + Zod schemas.
3. Checkout: capture customer address + GPS.
4. Waiter assign UI.
5. Driver accept/reject + status advancement UI.
6. Customer tracking page.
7. i18n + smoke test login flows for each role.
