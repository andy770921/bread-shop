# PRD: FEAT-12 — Shipping Fee Toggle & Home Promo Banner Toggle

## Problem Statement

Two shop-wide knobs are currently hard-coded in `shared/src/constants/cart.ts` and `frontend/src/components/layout/seasonal-banner.tsx`:

1. **Shipping fee** — every cart with subtotal `< NT$500` is charged `NT$60`. The owner cannot run a "free shipping for everyone" promotion, raise the fee, or change the free-shipping threshold without a code change and a redeploy.
2. **Home promo banner** — the gradient banner under the customer header is rendered unconditionally, reading its text from the `banner.text` i18n key. The owner can already edit the *text* via 文案設定, but cannot hide the banner outright when there is no active promotion.

Both controls belong on the existing 功能開關 (Feature Flags) admin page so the owner can flip them without engineering involvement and without touching pricing in code.

## Solution Overview

Add two new sections to `admin-frontend/src/routes/dashboard/feature-flags/FeatureFlags.tsx`:

1. **運費開關** — a master on/off switch. When **on**, two numeric inputs become editable: shipping fee (NT$) and free-shipping threshold (NT$). When **off**, every cart and order is charged `shipping_fee = 0` — the inputs are hidden / disabled. Saving writes through to the backend and the very next cart fetch reflects the new amounts.
2. **首頁促銷訊息** — a single on/off toggle. When **off**, `<SeasonalBanner />` is suppressed on the customer home page. When **on**, the banner renders with the text already maintained in `banner.text` via the existing 文案設定 page; this PRD does **not** introduce a separate promo-text editor.

Persistence lives in a new `shop_settings` singleton table (`id = 1`), modelled on the existing `pickup_settings` table from FEAT-10. Both backend cart total computation and order creation read from this row, replacing the hard-coded constants. The customer frontend gets a public `GET /api/shop-settings` endpoint so optimistic cart math and the home page can render correct values without round-tripping a fresh cart.

The hard-coded `SHIPPING_FEE` / `FREE_SHIPPING_THRESHOLD` constants in `shared/src/constants/cart.ts` are removed (`MAX_ITEM_QUANTITY` stays — it is genuinely a constant). All five call sites that referenced them are migrated to read from the DB-backed settings.

## User Stories

1. As the **shop owner**, I want a single toggle on the Feature Flags page to disable shipping fees entirely (e.g. for a free-shipping promotion week), so that no customer is charged shipping until I switch it back on.
2. As the **shop owner**, when shipping is enabled, I want to set the per-order shipping fee and the free-shipping threshold, so I can adjust pricing during peak season without a code change.
3. As the **shop owner**, I want my changes to take effect immediately on the next cart load — both for guest carts and for logged-in users — so I do not have to ask developers to redeploy.
4. As the **shop owner**, I want a separate toggle that hides the home page promotion banner, so the home page stays clean when there is no active promo.
5. As the **shop owner**, when I show the banner, I want its text to come from the existing 文案設定 page (key `banner.text`), so I do not learn a second editing surface.
6. As a **customer**, I want the shipping fee shown on the cart, the checkout pending screen, and the order detail to match what the shop owner configured at the time my order was placed — and I want existing orders to continue showing the historical shipping fee they were charged.

## Implementation Decisions

### Modules

**Backend — new `ShopSettingsModule`** (`backend/src/shop-settings/`)

- `ShopSettingsService` — reads / writes the `shop_settings` row; exposes a typed `getSettings(): Promise<ShopSettings>` consumed by `CartService`, `OrderService`, and the public + admin controllers. Caches the row in memory with a short TTL (30s) so that every cart fetch does not hit Postgres; admin writes invalidate the cache.
- `ShopSettingsController` — `GET /api/shop-settings` (public, no auth, no session). Returns the four fields: `{ shippingEnabled, shippingFee, freeShippingThreshold, promoBannerEnabled }`. Used by:
  - the customer cart page's optimistic math,
  - the customer home page to decide whether to render `<SeasonalBanner />`.
- `ShopSettings` is a singleton — same `id = 1` pattern as `pickup_settings`; no listing endpoint, no creation endpoint.

**Backend — `FeatureFlagsAdminController` extension** (`backend/src/admin/feature-flags-admin.controller.ts`)

- Add `PUT /api/admin/feature-flags/shop-settings` — `AdminAuthGuard`-protected. Accepts the full settings object (validated via `UpdateShopSettingsDto`). Delegates to `ShopSettingsService.updateSettings(dto, adminUserId)`.
- Existing `GET /api/admin/feature-flags` is widened to embed shop settings so the admin page renders one query: `{ homeVisibleCategoryIds: number[], shopSettings: ShopSettings }`.

**Backend — `CartService` + `OrderService` changes**

- `CartService.computeTotals()` (currently reads `CART_CONSTANTS.SHIPPING_FEE` / `FREE_SHIPPING_THRESHOLD`) takes a `ShopSettings` argument or calls `ShopSettingsService.getSettings()` once per request. When `shippingEnabled === false`, returns `shipping_fee = 0` regardless of subtotal.
- `OrderService.create()` (currently reads `CART_CONSTANTS.*` at line 158) does the same. The computed `shipping_fee` is persisted on the `orders` row exactly as today — the historical value is preserved and never recomputed against later admin edits.

**Customer frontend — `useShopSettings` hook + banner gate** (`frontend/src/queries/use-shop-settings.ts`, `frontend/src/components/layout/seasonal-banner.tsx`)

- New TanStack Query hook `useShopSettings()` calling `GET /api/shop-settings`. Long `staleTime` (5 min) since the value rarely changes; admin mutation invalidates this key on the customer side via the existing global cache invalidation only when a user later visits — admin changes are read on each cold query expiry.
- `<SeasonalBanner />` becomes a no-op render (`return null`) when `shopSettings.promoBannerEnabled === false`. When the query is loading, render nothing (avoid banner flash) — the small layout shift on first paint is acceptable for an unauth public-cache page.
- `frontend/src/utils/cart-math.ts` — drop the import of `CART_CONSTANTS.FREE_SHIPPING_THRESHOLD` / `SHIPPING_FEE`; the function now takes settings as an argument: `recalcCartTotals(items, settings, meta?)`. Callers in `frontend/src/queries/use-cart.ts` thread settings through.

**Admin frontend — new sections in Feature Flags page** (`admin-frontend/src/components/feature-flags/`)

- `ShippingSettingsSection.tsx` — Card with the on/off Switch, two numeric Inputs (shown only when on), Save button. Validates fee ≥ 0, threshold ≥ 0, fee ≤ 9999, threshold ≤ 999999.
- `PromoBannerSection.tsx` — Card with a single on/off Switch, plus a read-only preview of the current `banner.text` value (resolved through `useContentT`) and a deep link to /dashboard/content for editing. Save mutates immediately.
- `FeatureFlags.tsx` — composes the existing `<HomeVisibleCategoriesSection />` plus the two new sections.
- `queries/useFeatureFlags.ts` — extend with `useUpdateShopSettings()` mutation pointing at `PUT /api/admin/feature-flags/shop-settings`; on success invalidates the `['api','admin','feature-flags']` key.

**Shared** (`shared/src/types/shop-settings.ts`)

- `ShopSettings`, `UpdateShopSettingsRequest` — both expose camelCase fields on the wire (`shippingEnabled`, `shippingFee`, `freeShippingThreshold`, `promoBannerEnabled`), matching the FEAT-10 PickupSettings naming convention.
- `shared/src/constants/cart.ts` — delete `SHIPPING_FEE` and `FREE_SHIPPING_THRESHOLD`. Keep `MAX_ITEM_QUANTITY` (it remains a build-time constant). Update the seven call sites listed in `development/customer-frontend.md` and `development/backend-api.md`.

### Architecture

- **Singleton settings row.** Same shape as FEAT-10's `pickup_settings`: one row with `CHECK (id = 1)`, simple `WHERE id = 1` reads, no key/value juggling. Numeric columns are `integer NOT NULL` (TWD has no cents); booleans default to today's behavior (`shipping_enabled = true`, `shipping_fee = 60`, `free_shipping_threshold = 500`, `promo_banner_enabled = true`) so a fresh deploy preserves current production behavior on day zero.
- **No re-computation of past orders.** `orders.shipping_fee` continues to hold the value charged at submit time. Admin edits to `shop_settings` only affect *new* cart totals and *new* orders. This matches how the customer's own cart works in production today.
- **Cache layer.** `ShopSettingsService` keeps a process-local cache (30s TTL, single entry) — every cart-page render currently calls `cart.service.computeTotals()`, which would otherwise hit Postgres on every keystroke. Admin writes set the cached value to the new row immediately so the admin's next read is consistent.
- **Validation locus.** Numeric ranges are enforced by `class-validator` on `UpdateShopSettingsDto` (`@Min(0)`, `@Max(9999)` etc.) — same place we validate pickup settings — so the admin UI gets a clean 400 with a field name. The DB has only NOT NULL + non-negative checks; range tightness is owned by the DTO so business adjustments stay in TS.
- **Public read scope.** `GET /api/shop-settings` returns only the four user-facing fields. It does **not** return `updated_by` or `updated_at` (the same narrowing rule applied to public pickup settings — see FEAT-10 `database-schema.md` "RLS leakage note").
- **Banner toggle does not unmount layout.** When `promo_banner_enabled === false`, `<SeasonalBanner />` returns `null`; layout below it shifts up without an extra wrapping div. No fade animation in v1.
- **Feature flags response widening.** `GET /api/admin/feature-flags` returns a superset object so the admin page only fires one initial query. The existing `homeVisibleCategoryIds` field is preserved in shape — no client breaking change.

### APIs/Interfaces

**Public**

```
GET /api/shop-settings
→ {
    shippingEnabled: true,
    shippingFee: 60,
    freeShippingThreshold: 500,
    promoBannerEnabled: true,
  }
```

**Admin**

```
GET /api/admin/feature-flags
→ {
    homeVisibleCategoryIds: [1, 3, 7],
    shopSettings: {
      shippingEnabled, shippingFee, freeShippingThreshold, promoBannerEnabled,
    }
  }

PUT /api/admin/feature-flags/shop-settings
  body: {
    shippingEnabled: boolean,
    shippingFee: integer,            # 0..9999, ignored when shippingEnabled=false
    freeShippingThreshold: integer,  # 0..999999, ignored when shippingEnabled=false
    promoBannerEnabled: boolean,
  }
→ ShopSettings (the persisted row)
```

The existing `PUT /api/admin/feature-flags/home-visible-categories` is unchanged.

**Cart / order shape — no contract change**

`CartResponse.shipping_fee` and `Order.shipping_fee` remain integers as today. Only the *source* of the number changes (DB-driven vs. constant). Customer FE and existing tests do not need to change their assertions about response shape — only the expected numeric values in seed data.

## Testing Strategy

- **Backend unit — `shop-settings.service.spec.ts`** — covers: read of seed row, update with validation passing/failing, cache hit on second read, cache invalidated by update.
- **Backend unit — `cart.service.spec.ts` updates** — replace the hard-coded 60 / 500 expectations with a DI-injectable settings double, then assert: shipping enabled + below threshold → 60, shipping enabled + at threshold → 0, shipping disabled → 0 regardless of subtotal.
- **Backend unit — `order.service.spec.ts` updates** — same three branches, plus a regression test that an order placed under settings A keeps its `shipping_fee` even after settings change to B.
- **Backend integration — `feature-flags-admin.controller.e2e-spec.ts`** — admin updates shop settings, then the public `GET /api/shop-settings` and `GET /api/cart` reflect the new amounts.
- **Customer frontend — `cart-math.spec.ts` updates** — change the existing two assertions to thread `shopSettings` in; add a third case for `shippingEnabled=false` returning 0.
- **Customer frontend — `seasonal-banner.spec.tsx` (new)** — when `promoBannerEnabled` is false, the component renders `null`; when true, renders the `banner.text` value.
- **Admin frontend — `ShippingSettingsSection.spec.tsx` (new)** — toggle on/off hides/shows the inputs; saving with a negative number surfaces the field error; mutation is wired to the right endpoint.
- **Admin frontend — `PromoBannerSection.spec.tsx` (new)** — toggle persists; preview pulls from `useContentT('banner.text')`.
- **Manual QA checklist** — at `documents/FEAT-12/development/qa-checklist.md` (written alongside the implementation): turn shipping off → existing cart in another tab still shows old fee until refetch; turn promo off → home page hides banner within one second of admin save; existing orders (from before this feature) keep their original `shipping_fee` value displayed.

**Pre-existing fixtures that do NOT need to change.** Greps for `shipping_fee: 60` will surface `backend/src/auth/auth.controller.spec.ts` (lines 188, 249, 284) and `backend/src/checkout/checkout.service.spec.ts:20`. These mock the *response shape* returned by upstream services and continue to assert the legacy numeric values against literal fixtures — they do not exercise the new compute path and stay green without modification. Listed here so the implementer does not hunt for a bug in these files.

**Hard-coded i18n threshold removal — required.** The strings `cart.freeShippingNote` in `shared/src/i18n/{zh,en}.json:53` literally embed "NT$500". Toggling the threshold in admin without rewiring these strings yields a customer cart that shows the right shipping fee but the wrong "free over NT$500" promise. The customer-frontend implementation plan (Notes section) covers the two acceptable fixes; whichever is chosen, **leaving the strings untouched is not acceptable** and the QA checklist should explicitly verify the rendered text reflects the admin-set threshold.

## Out of Scope

- **Per-customer or per-product shipping rules.** Shipping is shop-wide. If "frozen" products later need a different fee, that is a future ticket.
- **Time-bounded promotions / scheduled flips.** The owner flips manually. There is no `valid_from` / `valid_to` for the promo banner or shipping rule in this PRD.
- **Promotion banner *content* editor in the Feature Flags page.** The text stays in 文案設定 / site-content. The Feature Flags page only links there.
- **Multiple banner variants or A/B testing.** One banner, one text key.
- **Shipping discount codes / coupon redemption.** Out of scope; not modelled.
- **Audit log of who changed what when.** `shop_settings.updated_by` is captured for forensic reads but no audit-log UI is built.
- **Recomputing existing `orders.shipping_fee`** when the admin lowers the fee. Historical orders are immutable.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
