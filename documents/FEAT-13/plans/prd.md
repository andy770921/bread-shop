# PRD: FEAT-13 — Daily Inventory Cap

## Problem Statement

Papa Bakery currently accepts an unbounded number of pickup orders for any given day. The owner produces a fixed amount of fresh stock daily and has no way to communicate "today's tray is sold out" through the customer cart. Two consequences:

1. Customers happily pick a pickup date that is already over-booked, only to be contacted by the owner afterwards to renegotiate. Slow, manual, and a poor first impression.
2. The owner cannot rely on order totals as a production planning signal because the shop will accept a 50-cake day even when realistic capacity is 3.

The owner wants a single shop-wide knob — settable from the existing 商品管理 page — that caps total daily item quantity. Above the cap, the customer cart must (a) reject the relevant date in the calendar so it can never be selected, and (b) defensively reject any submit that slips through the FE check (race-safe).

## Solution Overview

Four changes co-shipped:

1. **Admin 商品管理 page gains two top-level tabs** (per the design at `/Users/andy.cyh/Desktop/截圖 2026-04-25 中午12.49.36.png`):
   - **「編輯商品」** — the existing product list / create / edit experience, unchanged.
   - **「庫存設定」** — a single card with one dropdown:
     - `不設定庫存` *(default unset state)* — every product on the customer storefront accepts unlimited quantity into the cart and any pickup date stays bookable.
     - `每日總量` — when chosen, an integer input appears with default value `3`. The shop-wide daily cap is the **sum of `order_items.quantity`** for all non-cancelled orders whose `pickup_at` falls on that Asia/Taipei date.

2. **Customer `/cart` page enforces the cap on two layers:**
   - **Calendar gate** — `<PickupDatePicker>` disables every date `D` whose existing daily load `≥ daily_total_limit`. The customer never sees a "tomorrow" pill they cannot actually book.
   - **Submit guard** — `POST /api/orders` runs an atomic aggregate inside `OrderService.createOrder` *after* the existing pickup validator and *before* the order INSERT. If `existing_load + new_order_quantity > limit`, it throws `BadRequestException` with `code: 'daily_inventory_full'`. The cart form's submit handler maps that code to a Chinese toast (`此日期已額滿，請選擇其他日期`) and surfaces the calendar so the customer can pick again.

3. **Customer storefront surfaces the daily cap as a `訂購總量限制` badge / spec row** (per the designs at `/Users/andy.cyh/Desktop/截圖 2026-04-25 下午1.11.49.png` and `/Users/andy.cyh/Desktop/截圖 2026-04-25 下午1.12.34.png`):
   - **Product card** — every storefront card renders a small "庫存 N" pill near the 加入購物車 button when `inventoryMode === 'daily_total'`. `N` is the literal `dailyTotalLimit` from `shop_settings` — *not* the remaining capacity for any specific date. The pill is hidden entirely when `inventoryMode === 'unlimited'` so unlimited mode looks exactly like today.
   - **Product detail spec grid** — the existing 重量 / 保鮮期 / 製作時間 grid gains a `庫存` row with the same `dailyTotalLimit` value, again hidden in `unlimited` mode.

4. **New per-product bilingual `ingredients` field** displayed on the product detail spec grid as a `成分` row, editable from the admin product edit form. Adds `ingredients_zh` and `ingredients_en` text columns on `products`. Both columns are nullable so existing rows do not require backfill — when both are blank, the spec grid simply skips the `成分` row.

The dropdown `不設定庫存` ↔ `每日總量` maps internally to a typed enum `inventory_mode: 'unlimited' | 'daily_total'`. Storage for the cap is **shared with FEAT-12's `shop_settings` singleton** — two new columns rather than a new table. The cap is **shop-wide, not per-product** (the design has one dropdown on one tab; per-product caps remain out of scope). The `ingredients` columns, by contrast, are **per-product** and live on `products` because the value is intrinsically per-item.

**Important — what the customer-facing `庫存 N` displays.** Phase 1 mirrors the admin-set `dailyTotalLimit` literally on every card and detail page. It does **not** subtract the day's existing load nor render a per-date "remaining capacity". The `<PickupDatePicker>` calendar still shows real availability via `fullDates`; the card/detail badges are an *advertised cap*, not a live counter. This matches the user's brief ("以'每日庫存'在 BE 設定的數字直接顯示") and avoids re-querying capacity on every card render.

## User Stories

1. As the **shop owner**, I want a single dropdown on the 商品管理 page that lets me switch between "no cap" and "cap at N items per day" so I can match the storefront to my actual production capacity without a developer.
2. As the **shop owner**, when the cap is set to 3 and tomorrow already has three items reserved, I want the calendar in the customer cart to disable tomorrow so no customer can book a fourth.
3. As the **shop owner**, even if a customer somehow constructs a request that would push tomorrow past the cap (race condition with another customer in another tab), I want the backend to reject it cleanly with a 400 so I am never overbooked.
4. As the **shop owner**, I want lowering the cap *not* to retroactively cancel orders I already accepted. Existing orders stay valid; the cap only blocks *new* orders.
5. As a **customer**, when I open `/cart`, dates that are full should be visibly disabled (greyed) so I do not waste time picking one.
6. As a **customer**, if I happen to submit a form with a date that became full while I was filling in my contact info, the page should bounce me back to the calendar with a toast that says "此日期已額滿" rather than silently failing.
7. As a **customer**, if the shop has not set any cap (`inventory_mode = 'unlimited'`), nothing about my checkout flow changes — no greyed dates, no quantity-related toast.
8. As a **customer**, when the shop has a `每日總量` set, I want to see the cap number on every product card and on the product detail page so I understand "the shop only takes N items per day" before I pick a pickup date.
9. As a **customer**, when the shop is in `不設定庫存` mode, I want the storefront to look exactly as it does today — no `庫存` pill, no `庫存` row.
10. As a **customer**, on the product detail page I want to see the bakery's listed ingredients alongside the existing weight / shelf-life / prep-time specs, in my chosen locale, so I can check for allergens before ordering.
11. As the **shop owner**, I want to fill in `成分` (Chinese and English independently) per product on the product edit form. If I leave both blank for a product, the customer detail page should simply omit the `成分` row rather than showing an empty label.

## Implementation Decisions

### Modules

**Backend — extend `ShopSettingsModule`** (`backend/src/shop-settings/`)

- Add two columns to `shop_settings`: `inventory_mode TEXT NOT NULL DEFAULT 'unlimited'` (`CHECK in ('unlimited','daily_total')`), `daily_total_limit INTEGER NOT NULL DEFAULT 3` (`CHECK > 0`).
- `ShopSettings` shared type widens to `{ shippingEnabled, shippingFee, freeShippingThreshold, promoBannerEnabled, inventoryMode, dailyTotalLimit }`. The 30s in-process cache from FEAT-12 keeps reads cheap.
- `UpdateShopSettingsDto` gains `@IsIn(['unlimited','daily_total'])` and `@IsInt() @Min(1) @Max(999)` validators. The numeric value is stored even when `inventoryMode = 'unlimited'` so flipping back to `daily_total` restores the prior limit.

**Backend — new `InventoryService`** (`backend/src/shop-settings/inventory.service.ts`)

- Single deep helper that owns the daily-load aggregate and the cap check.
- `getDailyLoad(): Promise<Map<TaipeiYmd, number>>` — runs the aggregate query against `orders ⨝ order_items` filtered to non-cancelled orders whose `pickup_at >= now() - lead_buffer`. Bounded by the public booking window; cheap at this scale (single `SELECT ... GROUP BY` over a low-cardinality table).
- `getFullDates(): Promise<string[]>` — returns the `YYYY-MM-DD` Taipei-date strings whose load `>= daily_total_limit`. Returns `[]` when `inventoryMode === 'unlimited'`.
- `assertHasCapacity(pickupAt: Date, additionalQuantity: number): Promise<void>` — atomic-style guard called from `OrderService.createOrder` right after pickup validation and right before the orders INSERT. Throws `BadRequestException({ code: 'daily_inventory_full', message: '此日期已額滿', date: 'YYYY-MM-DD', limit, currentLoad })`.

**Backend — new `PickupAvailabilityController`** (lives in the existing `pickup` module)

- `GET /api/pickup-availability` (public, no auth, no session). Returns:
  ```json
  {
    "mode": "unlimited" | "daily_total",
    "limit": 3 | null,
    "fullDates": ["2026-04-26", "2026-04-27"]
  }
  ```
- Consumed by the customer FE to compute the calendar's `disabled` matcher. **Always returns 200**, even in `unlimited` mode (`fullDates: []`), so the FE's hook is unconditional.
- Co-locating it under `pickup-*` keeps URL grouping consistent with FEAT-10's `/api/pickup-settings`.

**Backend — `OrderService.createOrder` integration**

- Inject `InventoryService` via the constructor. Right after the existing pickup validator (line ~108) and right before the cart snapshot at line ~113, compute the new order's total quantity from the cart snapshot and call `inventory.assertHasCapacity(new Date(dto.pickup_at), totalQuantity)`. The order is rejected before any rows are written.
- The second compute path `normalizeCheckoutCart()` does **not** need a separate guard — `createOrder` is the only insert site and the new check sits on the path that leads to that insert.

**Customer frontend — new `usePickupAvailability` hook + `<PickupDatePicker>` extension**

- `frontend/src/queries/use-pickup-availability.ts` — TanStack Query against `GET /api/pickup-availability`. Short `staleTime` (60s) because the load changes every time another customer submits an order; longer than the cart-page render lifetime is fine since the submit guard catches the race anyway.
- `<PickupDatePicker>` accepts `fullDates: Set<string>` and adds one matcher: `(d: Date) => fullDates.has(format(d, 'yyyy-MM-dd'))`. The set is keyed in **Asia/Taipei** to match how the BE buckets the load.
- `frontend/src/queries/use-checkout.ts` (or wherever `useCreateOrder` lives) — on 400 with `code === 'daily_inventory_full'`, surface a Chinese toast `t('cart.dailyInventoryFull')` and invalidate the `['api','pickup-availability']` cache so the calendar redraws with the now-full date greyed.
- After **any** successful order create, invalidate `['api','pickup-availability']` so the very next render reflects the updated load (matters for a customer placing two orders back-to-back on the same browser session).

**Customer frontend — storefront cap surface**

- Product card (`frontend/src/components/product/product-card.tsx` or equivalent) renders a `庫存 N` pill next to / above 加入購物車 when `useShopSettings().data.inventoryMode === 'daily_total'`. The number is literally `useShopSettings().data.dailyTotalLimit`. Hidden in `unlimited` mode.
- Product detail page (`frontend/src/app/products/[id]/page.tsx` or equivalent) renders a `庫存` row inside the existing spec grid (same component that already shows 重量 / 保鮮期 / 製作時間), driven by the same `useShopSettings()` data — no extra fetch.
- Both places call into the **already-existing** `useShopSettings()` hook from FEAT-12. After this ticket widens `ShopSettings` with `inventoryMode` + `dailyTotalLimit`, both fields automatically flow through to the customer FE without a new query.

**Customer frontend — `成分` row on product detail**

- Product detail spec grid renders a `成分` row when `product.ingredients_zh` (zh locale) or `product.ingredients_en` (en locale) is non-empty. The row is omitted entirely when both values are null/empty for a given product.
- Locale selection follows the existing pattern: `useLocale().locale === 'zh'` reads `ingredients_zh`, otherwise `ingredients_en`. If the active-locale field is empty but the other locale is filled, **fall back to the other locale** rather than showing an empty row — same fallback policy already used by `name_zh`/`name_en` in the customer cart.

**Admin frontend — per-product ingredients field**

- `admin-frontend/src/routes/dashboard/products/ProductForm.tsx` gains two `<Textarea>` fields, `成分（中文）` and `成分（英文）`, both optional, both rendered side-by-side in the same two-column row that already hosts `descriptionZh` / `descriptionEn`.
- The product-form Zod schema gains `ingredients_zh: z.string().optional()` and `ingredients_en: z.string().optional()`. The mutation payload widens to carry both.

**Admin frontend — tab split on the products route**

- `admin-frontend/src/routes/dashboard/products/ProductList.tsx` (the route's default index component, today renders the product table) gets wrapped in a top-level `<Tabs>` (`admin-frontend/src/components/ui/tabs.tsx` is already present and Radix-backed). Two triggers: `編輯商品` (default active, contains the existing list + 新增商品 button + table — pulled out as `ProductManagementSection.tsx` if helpful), and `庫存設定` (a new `InventorySettingsSection.tsx`).
- `InventorySettingsSection.tsx` reads `useFeatureFlags()` (which already returns `shopSettings`) and writes via `useUpdateShopSettings()` (FEAT-12 mutation). One `<select>` (`不設定庫存` / `每日總量`), one numeric `<Input>` shown only when `daily_total` is active, and one `儲存` button. The component re-uses the saved-fee/threshold pattern from FEAT-12's `ShippingSettingsSection`.
- The per-product `ProductForm` is **not** changed.

**Shared** (`shared/src/types/shop-settings.ts`)

- Add `inventoryMode: 'unlimited' | 'daily_total'` and `dailyTotalLimit: number` to `ShopSettings` and `UpdateShopSettingsRequest`.
- New `shared/src/types/pickup-availability.ts` exporting `PickupAvailability { mode, limit, fullDates }`.

**Shared** (`shared/src/types/product.ts`)

- Widen `Product` and `AdminProduct` (and the create/update DTOs) to carry `ingredients_zh: string | null` and `ingredients_en: string | null`. Public list/detail responses include both fields; the customer FE picks per locale.

### Architecture

- **Storage on `shop_settings`, not per-product.** The design has exactly one dropdown for the entire shop, so a singleton column pair on the existing settings row keeps the surface tiny and avoids a new table just to hold two numbers.
- **Aggregate, do not denormalise.** Computing daily load on-demand from `orders ⨝ order_items` keeps the schema simple. A `daily_pickup_load` materialised table would shave a few ms per cart-page load but introduces a write-side trigger that has to stay synchronised with order status changes — too much rope for v1. The query is bounded by the booking window (≤30 days × O(orders/day)). **The daily-load aggregate is *not* cached at the controller layer** — every `assertHasCapacity` and every `getAvailability` call hits the RPC. This keeps the guard race-tight: a customer's cart submit always compares against the freshest possible load. At Papa Bakery's scale (single-digit orders/day) the per-call cost is negligible.
- **Status filter is `status != 'cancelled'`.** Pending, paid, preparing, shipping, and delivered all hold the slot. Cancellation is the only state that releases capacity. (Refunded orders that stay in `delivered` still count — they were physically picked up.)
- **Race safety.** The guard inside `createOrder` reads the daily-load aggregate fresh from the RPC every call (no controller-layer cache) **and** reads `shop_settings` via `ShopSettingsService.getSettingsFresh()` (which bypasses the 30s in-process cache). Both reads are uncached so a freshly-lowered cap takes effect on the very next submit and two concurrent submits cannot both see the same stale view. The trade-off is one extra SELECT per order create; acceptable because order creates are rare relative to cart-page loads. The guard is **not** wrapped in a transaction, so a millisecond-scale race between two concurrent INSERTs on the last open slot can still let both through — see the v1 caveat below.
- **Cap is forward-only.** Lowering the cap from 5 to 3 does not retroactively cancel anything. The four orders already on a day stay; the next would-be fifth is simply rejected. This matches the FEAT-12 precedent that admin edits don't mutate historical rows.
- **Calendar source of truth = backend.** The customer FE never tries to compute "is this date full" from its own cart data. It receives a `fullDates: string[]` array and trusts it. This keeps the FE dumb and avoids divergent capacity logic.
- **STRICT: `unlimited` mode hides every inventory affordance on the storefront.** When `useShopSettings().data.inventoryMode === 'unlimited'`, the customer FE must render **no** inventory information — no `庫存 N` pill on the product card, no `庫存` row on the product detail spec grid, no greyed dates in the calendar (because `fullDates` will be `[]` from the BE anyway), no toast wording that mentions a daily cap. The storefront in `不設定庫存` mode must be visually indistinguishable from the pre-FEAT-13 storefront. Test by toggling the admin dropdown and reloading `/` and `/products/:id` — there should be zero new pixels visible.
- **Public endpoint scope.** `GET /api/pickup-availability` returns *only* the dates and the limit. It does not leak per-customer order data — only the booleans the calendar needs. Same narrowing principle as FEAT-10's `/api/pickup-settings`.
- **No FE submit pre-check beyond the calendar disable.** The calendar already prevents a date from being selected when full. The race-safe BE check covers the corner case where a date became full while the customer was filling out the form. Adding a redundant FE pre-check would just mean two places to forget to update.

### APIs/Interfaces

**Public**

```
GET /api/pickup-availability
→ {
    mode: "unlimited" | "daily_total",
    limit: number | null,
    fullDates: string[]   // ["2026-04-26", "2026-04-27"], Asia/Taipei dates
  }

GET /api/products
GET /api/products/:id
→ Product objects now include:
    ingredients_zh: string | null,
    ingredients_en: string | null
```

The card / detail components read **`dailyTotalLimit` from `GET /api/shop-settings`** (already public from FEAT-12) — no new card-only endpoint. The card surface needs neither per-date load nor per-product capacity.

**Admin product mutations** — `POST /api/admin/products` and `PATCH /api/admin/products/:id` payloads widen with optional `ingredients_zh` and `ingredients_en` fields. Both default to `null` on create. Empty strings are coerced to `null` at the service layer so the DB never holds `''` (mirrors how `description_zh` / `description_en` are handled today).

**Admin shop-settings** — no new endpoint. The existing `PUT /api/admin/feature-flags/shop-settings` payload widens:

```
PUT /api/admin/feature-flags/shop-settings
  body: {
    shippingEnabled, shippingFee, freeShippingThreshold, promoBannerEnabled,
    inventoryMode: "unlimited" | "daily_total",
    dailyTotalLimit: integer  // 1..999, ignored when inventoryMode = 'unlimited'
  }
→ ShopSettings (the persisted row)
```

**Order submit — error contract**

```
POST /api/orders
  rejects 400:
    { code: "daily_inventory_full",
      message: "此日期已額滿",
      date: "2026-04-26",
      limit: 3,
      currentLoad: 3 }
```

The customer FE matches on `code === 'daily_inventory_full'` and shows the locale-aware toast.

## Testing Strategy

- **Backend unit — `inventory.service.spec.ts` (new)**:
  - `getDailyLoad` aggregates only non-cancelled orders.
  - `getFullDates` returns `[]` when `inventoryMode = 'unlimited'`.
  - `assertHasCapacity` throws `BadRequestException` with the documented payload when `existingLoad + addQuantity > limit`.
  - Edge: `additionalQuantity > limit` on a day with zero existing orders still rejects (no negative slots).

- **Backend unit — `order.service.spec.ts` extension**: the existing `createOrder pickup validator failure` describe block grows a sibling `createOrder inventory cap failure` that mocks the inventory service to throw and asserts the order INSERT never runs.

- **Backend integration — `order.controller.e2e-spec.ts`**: place 3 single-quantity orders for date D, then try a fourth → expect 400 with the documented body. Cancel one → fourth attempt now succeeds. Toggle `inventoryMode = 'unlimited'` → cap stops applying.

- **Backend integration — `pickup-availability.controller.e2e-spec.ts` (new)**: with three orders on D and `daily_total_limit = 3`, GET → `fullDates: ["D"]`. Toggle to `unlimited` → `fullDates: []`.

- **Customer frontend unit** — extend `PickupDatePicker.test.tsx` (already configured per FEAT-10) with a case that asserts a date in `fullDates` is rejected by the composed `disabled` matcher.

- **Customer frontend manual** — open two tabs, both at `/cart` with the same date selected; submit one, refresh the other → calendar still shows the date selectable until the user reopens the picker (cache `staleTime` 60s); submit → 400 → toast → calendar greys the date on next open.

- **Admin frontend unit** — `InventorySettingsSection.spec.tsx`: dropdown change to `每日總量` reveals the input; saving with a negative value surfaces a field error; mutation is wired to `PUT /api/admin/feature-flags/shop-settings`.

- **QA checklist** at `documents/FEAT-13/development/qa-checklist.md`: covers the lower-the-cap-with-existing-overflow case (no retro cancellation), the cancel-an-existing-order-frees-the-slot case, and the unlimited-mode passes-through case.

- **Customer storefront unit (new)** — `frontend/src/components/product/product-card.spec.tsx`: card shows the `庫存 N` pill when `inventoryMode = 'daily_total'` with `dailyTotalLimit = 3`; pill is absent under `unlimited`.
- **Customer storefront unit (new)** — `frontend/src/app/products/[id]/page.spec.tsx`: spec grid shows `庫存` row and `成分` row when both fields are populated; `成分` row is omitted when both `ingredients_zh` and `ingredients_en` are null/empty; `庫存` row is omitted in `unlimited` mode.
- **Admin form unit (existing)** — `ProductForm.spec.tsx`: filling `成分（中文）` only round-trips the value (does not require `成分（英文）` to be filled).
- **Backend** — extend the products controller spec to assert `ingredients_zh` / `ingredients_en` are returned in public list/detail responses.

## Out of Scope

- **Per-product stock counts.** This PRD ships a single global daily cap. If the owner later wants "max 5 cakes AND max 10 cookies", that is a future ticket with a per-product `daily_limit` column on `products`.
- **Per-time-slot caps.** Capacity is per *day*, not per slot. A "3 by 15:00 + 3 by 20:00" model is out of scope.
- **Time-zone configurability.** Daily buckets are `Asia/Taipei`. Hard-coded to match the rest of the project (FEAT-10 pickup validator uses the same TZ).
- **Calendar showing "X / 3 booked" for partial days.** v1 only greys *full* days. Showing a remaining-capacity badge per date is a future polish.
- **Per-card / per-detail "remaining today: X" counter.** The `庫存 N` pill always shows the configured cap, never the residual capacity for any specific date. A per-date counter would require either a new public endpoint or extending `pickup-availability` to return `{ date, remaining }[]`. Out of scope.
- **Allergen tagging / structured ingredients list.** `ingredients_zh` and `ingredients_en` are free-form `text` fields. No allergen tags, no per-line item breakdown, no autocomplete.
- **Markdown / rich text for ingredients.** Plain text only. The customer detail renders the value with `whitespace-pre-line` so newlines are honoured, but no inline formatting.
- **Admin override / one-off "I'll squeeze in a fourth today" UI.** The cap is total — admins must lower / raise it themselves to push through extras.
- **Stock auto-decrement for line items.** No `cart_items.reserved_quantity` or hold/lock semantics. Capacity is recomputed at the moment of submit; no temporary reservations.
- **Notification when a customer attempts a full date.** No email/LINE alert to the owner. The customer just sees the toast and picks another date.
- **Recomputing existing orders' validity** when admin lowers the cap. Out of scope; existing orders stay.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
