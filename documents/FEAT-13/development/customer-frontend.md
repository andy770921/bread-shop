# Implementation Plan: Customer Frontend

## Overview

Two changes on the customer side:

1. The `<PickupDatePicker>` calendar disables every date returned in `fullDates` from `GET /api/pickup-availability`.
2. The cart submit handler in `frontend/src/queries/use-checkout.ts` (or wherever the order create mutation lives) maps a `400 { code: 'daily_inventory_full' }` response to a Chinese toast and invalidates the availability cache so the calendar updates immediately.

A new `usePickupAvailability` hook owns the TanStack Query for the public endpoint.

## Files to Modify

### New files

- `frontend/src/queries/use-pickup-availability.ts` — TanStack Query hook.

### Modified files

- `frontend/src/features/pickup/PickupDatePicker.tsx` — accept `fullDates` and append a matcher.
- `frontend/src/features/pickup/PickupSection.tsx` (or wherever `<PickupDatePicker>` is rendered) — pull `fullDates` from `usePickupAvailability` and pass it down.
- `frontend/src/features/checkout/use-checkout-flow.ts` — **this** is the actual order-create pipeline (not `frontend/src/queries/use-checkout.ts`, which only exposes `useStartLineCheckout` / `useConfirmPendingLineOrder` thin wrappers). `submitCheckout` (around line 44–90) calls `startLineCheckoutAsync` and then `confirmPendingLineOrderAsync`; the BE 400 with `code: 'daily_inventory_full'` will surface from whichever of those touches `POST /api/orders`. Catch the error inside `submitCheckout`, branch on `code === 'daily_inventory_full'`, show `toast.error(t('cart.dailyInventoryFull'))`, invalidate `['api','pickup-availability']`, and rethrow / return so the existing `cart/page.tsx onSubmit` outer try/catch keeps working. Do **not** introduce a new `useCreateOrder` mutation — none exists today.
- `frontend/src/app/cart/page.tsx` — the success path already invalidates `QUERY_KEYS.cart`. Add a sibling `queryClient.invalidateQueries({ queryKey: ['api','pickup-availability'] })` in the same block so the calendar redraws after a successful submit.
- `frontend/src/components/product/product-card.tsx` — render `庫存 N` pill near the 加入購物車 button, gated on `inventoryMode === 'daily_total'`.
- `frontend/src/components/product/product-editorial.tsx` — **this is where the existing `重量 / 保鮮期 / 製作時間` spec rows live**, NOT under `frontend/src/app/products/[id]/page.tsx` (no such file exists; there is no per-product detail route). The existing rows are rendered by mapping over `product.specs[]` (a JSON column on `products`, see lines 77–95). The `庫存` and `成分` rows are appended as additional sibling rows after the `specs.map(...)` block — they are NOT entries in the `specs` array, they are component-local conditional rows.
- `shared/src/i18n/zh.json` and `shared/src/i18n/en.json` — `shared/src/i18n/zh.json` has **no `product` namespace today** — only `nav, category, badge, spec, home, cart, process, banner, auth, profile, orders, checkout, status` (and `spec.weight / spec.shelf_life / spec.prep_time` already exist). To stay consistent with how the spec grid already labels rows, **add the new keys under `spec.*`**: `spec.daily_limit` (`庫存` / `Daily limit`) and `spec.ingredients` (`成分` / `Ingredients`). The existing `t(\`spec.\${spec.label_key}\`)` pattern in `product-editorial.tsx` already resolves `spec.weight` etc. — `daily_limit` and `ingredients` go into the same namespace. Add `cart.dailyInventoryFull` under the existing `cart.*` namespace.
- `frontend/src/features/pickup/pickup-schema.spec.ts` — extend with a `fullDates`-matcher unit test or add a new spec next to it (per implementer preference).

## Step-by-Step Implementation

### Step 1: i18n keys

**File:** `shared/src/i18n/zh.json` — extend the existing `spec` namespace and `cart` namespace; do **not** create a new `product` top-level key.

```json
"spec": {
  /* ...existing weight, shelf_life, prep_time... */
  "daily_limit": "庫存",
  "ingredients": "成分"
},
"cart": {
  /* ...existing... */
  "dailyInventoryFull": "此日期已額滿，請選擇其他日期"
}
```

**File:** `shared/src/i18n/en.json` — same shape, English values.

```json
"spec": {
  /* ...existing... */
  "daily_limit": "Daily limit",
  "ingredients": "Ingredients"
},
"cart": {
  /* ...existing... */
  "dailyInventoryFull": "This pickup date is fully booked. Please pick another date."
}
```

**Rationale:** The existing customer FE labels every spec row via `t(\`spec.\${spec.label_key}\`)`. Co-locating the new labels under `spec.*` keeps the resolver code path symmetric — the new conditional rows use `t('spec.daily_limit')` and `t('spec.ingredients')` directly. There is **no `product` top-level namespace in `shared/src/i18n/zh.json`** (only `admin-frontend/src/i18n/zh.json` has one, and that is for admin-only labels). `cart.dailyInventoryFull` is the toast message; the FE always uses the i18n key, not the server message field, so toasts respect the customer's locale.

### Step 2: `usePickupAvailability` hook

**File:** `frontend/src/queries/use-pickup-availability.ts` (new)

```ts
import { useQuery } from '@tanstack/react-query';
import type { PickupAvailability } from '@repo/shared';

export const PICKUP_AVAILABILITY_KEY = ['api', 'pickup-availability'] as const;

export function usePickupAvailability() {
  return useQuery<PickupAvailability>({
    queryKey: PICKUP_AVAILABILITY_KEY,
    staleTime: 60_000,
  });
}
```

**Rationale:**

- The default `queryFn` from `frontend/src/vendors/tanstack-query/provider.tsx` already serializes `['api','pickup-availability']` to `/api/pickup-availability` via `stringifyQueryKey`, so no custom fetcher is needed.
- `staleTime: 60_000` keeps the fetch cheap during a typical cart-page session. The BE submit guard catches the race window where another customer fills the date in between renders.

### Step 3: Extend `<PickupDatePicker>`

**File:** `frontend/src/features/pickup/PickupDatePicker.tsx`

The current `disabled` array (lines 30–35) has four matchers from FEAT-10. Append one more:

```tsx
import { format } from 'date-fns';
/* ...existing imports... */
import { usePickupAvailability } from '@/queries/use-pickup-availability';

export function PickupDatePicker({ settings }: { settings: PickupSettingsResponse }) {
  /* ...existing setup... */
  const { data: availability } = usePickupAvailability();
  const fullDateSet = new Set<string>(availability?.fullDates ?? []);

  const disabled = [
    { before: earliest },
    { after: end },
    (d: Date) => settings.disabledWeekdays.includes(d.getDay()),
    ...(closureStart && closureEnd ? [{ from: closureStart, to: closureEnd }] : []),
    (d: Date) => fullDateSet.has(format(d, 'yyyy-MM-dd')),
  ];

  /* ...rest unchanged... */
}
```

**Rationale:**

- The `fullDates` array is converted to a `Set` once per render so the matcher's `has()` is O(1) per calendar cell. Building inside the component is fine — a 30-day list at most.
- `format(d, 'yyyy-MM-dd')` matches the BE's Asia/Taipei YYYY-MM-DD output. The picker renders local-host dates, but the BE buckets in Taipei. **For users in Taipei** — the project's only target market — the two coincide. If a user travels and opens the cart from a different timezone, the picker may grey the wrong day by ±1 row; treat as a known v1 limitation (see Notes).
- `availability?.fullDates ?? []` means before the query resolves, no dates are disabled. Combined with the BE submit guard, this is safe.

### Step 4: Pull-down site

**File:** `frontend/src/features/pickup/PickupSection.tsx`

If `<PickupDatePicker>` is rendered without props beyond `settings`, no change is needed — the new hook is internal to the picker. Skip Step 4.

If, however, the parent already calls `usePickupAvailability` for some other reason and you would prefer a single fetch site, lift the hook into `PickupSection.tsx` and pass `fullDates` down. Either pattern works; the implementer should pick whichever keeps the codebase tidiest at the time. The PRD does not mandate a choice.

### Step 5: Cart submit handler

**File:** `frontend/src/features/checkout/use-checkout-flow.ts` — there is no `useCreateOrder` mutation. The submit pipeline is `useCheckoutFlow.submitCheckout`, which calls `startLineCheckoutAsync` and then `confirmPendingLineOrderAsync` (both from `useStartLineCheckout` / `useConfirmPendingLineOrder` in `frontend/src/queries/use-checkout.ts`). Whichever of those touches `POST /api/orders` is where the BE 400 will surface.

Wrap the existing `submitCheckout` body in a try/catch (or extend the existing one if present). On `ApiResponseError` with `body.code === 'daily_inventory_full'`, fire `toast.error(t('cart.dailyInventoryFull'))`, invalidate the availability cache, and rethrow so the cart page's outer error UX still runs:

```ts
import { ApiResponseError } from '@repo/shared';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { PICKUP_AVAILABILITY_KEY } from '@/queries/use-pickup-availability';
import { useLocale } from '@/hooks/use-locale';

export function useCheckoutFlow(/* existing args */) {
  const qc = useQueryClient();
  const { t } = useLocale();
  /* ...existing hooks... */

  const submitCheckout = useCallback(async (values: CartFormValues) => {
    try {
      /* existing startLineCheckoutAsync + confirmPendingLineOrderAsync flow */
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 400) {
        const body = err.body as { code?: string } | undefined;
        if (body?.code === 'daily_inventory_full') {
          toast.error(t('cart.dailyInventoryFull'));
          qc.invalidateQueries({ queryKey: PICKUP_AVAILABILITY_KEY });
        }
      }
      throw err;
    }
  }, [/* ...deps... */]);
}
```

**Cart page success path** (`frontend/src/app/cart/page.tsx`): the existing `await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart })` block (around line 80) gets a sibling `await queryClient.invalidateQueries({ queryKey: PICKUP_AVAILABILITY_KEY })` so a successful submit refreshes the calendar before the user is redirected.

**Rationale:**

- The customer-side `fetchApi` from `@repo/shared` throws `ApiResponseError` with `status` and `body` populated. Branch on the parsed JSON's `code` field, not on the message string, so locale changes never break the matching.
- Invalidating the availability key on **both** success and the inventory-full failure means the calendar redraws with the now-full date greyed before the customer can re-submit. The submit button itself stays enabled; the user picks a different date and tries again.
- Rethrowing the error keeps the existing cart-page try/catch path working (it logs / surfaces a generic toast for unhandled cases). Inserting the `daily_inventory_full` branch *before* the rethrow means the specific toast wins for this code, while every other 400 falls through unchanged.

### Step 6: pickup-schema.spec extension

**File:** `frontend/src/features/pickup/pickup-schema.spec.ts` (existing)

Append one describe block that constructs a fake `disabled` array (the same composition as `PickupDatePicker.tsx`) and asserts a date present in `fullDates` is rejected. This is a smoke test for the matcher contract; the integration test for the actual picker rendering lives in `PickupDatePicker.test.tsx` if/when we add one.

### Step 7: Render `庫存 N` on product cards

**File:** `frontend/src/components/product/product-card.tsx` (confirmed to exist — 122 lines).

```tsx
import { useShopSettings } from '@/queries/use-shop-settings';
import { useLocale } from '@/hooks/use-locale';

export function ProductCard({ product }: { product: Product }) {
  const { t } = useLocale();
  const { data: settings } = useShopSettings();
  const showInventory = settings?.inventoryMode === 'daily_total';
  /* ...existing card JSX, including price + 加入購物車 button... */
  return (
    <div className="card">
      {/* ...image, name, price... */}
      <div className="flex items-center gap-2">
        {showInventory && (
          <span
            className="rounded px-2 py-0.5 text-xs font-medium"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            {t('spec.daily_limit')} {settings.dailyTotalLimit}
          </span>
        )}
        <Button onClick={...}>{t('cart.addToCart')}</Button>
      </div>
    </div>
  );
}
```

**STRICT rule (PRD § Architecture):** when `showInventory` is `false` (i.e. `unlimited` mode or the query is still loading), the pill **must not render at all** — not as an empty span, not as a placeholder, not as `display: none`. The DOM tree in `不設定庫存` mode must be byte-identical to the pre-FEAT-13 card. The unit test in `Step 9` enforces this.

**Rationale:** `useShopSettings()` is **not** currently called from the home page (`frontend/src/app/page.tsx`) — only the cart imports it. Calling it from `product-card.tsx` adds a fresh `GET /api/shop-settings` on cold visits to `/`. TanStack caches it after first response (30s `staleTime`), so subsequent renders share the query, but the first storefront visit is one extra round-trip vs. before FEAT-13. The cost is negligible (one cached GET) and avoids prop-drilling settings from page-level into every card.

### Step 8: Render `庫存` + `成分` on the product detail (`product-editorial.tsx`)

**File:** `frontend/src/components/product/product-editorial.tsx` — there is **no** `frontend/src/app/products/[id]/page.tsx`. The detail spec grid lives inside `product-editorial.tsx` at lines 77–95: it iterates `product.specs` (a JSON `ProductSpec[]` column) using `t(\`spec.\${spec.label_key}\`)` for the label and `pickLocalizedText(locale, { zh: spec.value_zh, en: spec.value_en })` for the value.

Append the two new rows as **sibling JSX nodes after the `specs.map(...)` block** — they are not entries in the `specs` array, they are component-local conditional rows:

```tsx
import { useShopSettings } from '@/queries/use-shop-settings';
import { pickLocalizedText } from '@/i18n/utils';

const { locale, t } = useLocale();
const { data: settings } = useShopSettings();
const showInventory = settings?.inventoryMode === 'daily_total';
const ingredientsValue = pickLocalizedText(locale, {
  zh: product.ingredients_zh,
  en: product.ingredients_en,
});

return (
  <>
    {/* ...existing editorial JSX... */}
    {product.specs && product.specs.length > 0 && (
      <dl /* ...existing grid... */>
        {product.specs.map((spec, i) => (
          /* ...existing row... */
        ))}
        {showInventory && (
          <div /* ...same row classes the existing rows use... */>
            <dt>{t('spec.daily_limit')}</dt>
            <dd>{settings.dailyTotalLimit}</dd>
          </div>
        )}
        {ingredientsValue && (
          <div>
            <dt>{t('spec.ingredients')}</dt>
            <dd className="whitespace-pre-line">{ingredientsValue}</dd>
          </div>
        )}
      </dl>
    )}
  </>
);
```

If both `showInventory` and `ingredientsValue` are falsy AND `product.specs` is empty, the whole `<dl>` block stays hidden by the existing outer `product.specs && product.specs.length > 0` gate. If only one of them is truthy and `product.specs` is empty, the gate hides the new rows too — that is acceptable behaviour for v1; widening the gate to `(product.specs?.length || showInventory || ingredientsValue)` is a follow-up if the team prefers.

**Locale fallback:** use `pickLocalizedText(locale, { zh, en })` from `frontend/src/i18n/utils.ts` (already used by the cart at `cart/page.tsx:240–243`). It returns the trimmed active-locale value, falls back to the other locale, and returns `''` when both are blank — the empty-string check `if (!ingredientsValue) skip` handles all three cases in one helper call. Do **not** hand-roll the `(locale === 'zh' ? a : b) || (locale === 'zh' ? b : a)` ternary.

**STRICT rules:**

- **`庫存` row** renders **only** when `showInventory === true`. In `unlimited` mode (or while the settings query is loading), the row markup is not in the DOM at all — the spec grid is rendered as if FEAT-13 never happened. The pre-FEAT-13 detail page must be byte-identical to the post-FEAT-13 detail page when `inventoryMode === 'unlimited'`.
- **`成分` row** renders **only** when `ingredientsValue` resolves to a non-empty string. If both `ingredients_zh` and `ingredients_en` are null/empty, the row is omitted — the grid does not show an empty `成分` label.

**Rationale:** Adding rows as sibling JSX (rather than pushing into a `specRows` array and remapping) keeps the diff small and preserves the existing `specs.map((spec, i) => …)` block exactly. `whitespace-pre-line` honours newlines without enabling HTML / Markdown.

### Step 9: Storefront unit tests

**File:** `frontend/src/components/product/product-card.spec.tsx` (new):

- With `useShopSettings` mocked to `{ inventoryMode: 'daily_total', dailyTotalLimit: 3, ... }`, assert the rendered HTML contains `庫存 3` (zh) / `Daily limit 3` (en).
- With `useShopSettings` mocked to `{ inventoryMode: 'unlimited', ... }`, assert the rendered HTML **does not** contain the substring `庫存` / `Daily limit`. Use `expect(container).not.toHaveTextContent(...)` rather than `toBeNull()` so the test catches empty-tag regressions too.
- With `useShopSettings` returning `{ data: undefined }` (still loading), assert the same absence.

**File:** `frontend/src/components/product/product-editorial.spec.tsx` (new — there is no `frontend/src/app/products/[id]/page.tsx` to test):

- Spec grid contains `庫存` row when `daily_total` + `成分` row when `ingredients_zh` is filled.
- Spec grid omits `庫存` row in `unlimited` mode.
- Spec grid omits `成分` row when both `ingredients_zh` and `ingredients_en` are null.
- Locale = `en`, only `ingredients_zh` filled → `成分` row falls back and shows the zh value (per `pickLocalizedText` semantics).

## Testing Steps

1. **Unit (`pickup-schema.spec.ts` extension):** the new matcher rejects a date in `fullDates`.
2. **Unit (`PickupDatePicker.test.tsx`)** — if the project already has one (per FEAT-10 testing strategy): mock `usePickupAvailability` to return `fullDates: ['2026-05-01']`; assert the day-cell for May 1 has the `data-disabled` attribute (whatever the day-picker primitive sets).
3. **Unit (`product-card.spec.tsx` — see Step 9):** card pill renders / hides correctly across `daily_total`, `unlimited`, and loading states.
4. **Unit (`products/[id]/page.spec.tsx` — see Step 9):** spec grid `庫存` and `成分` rows render / omit correctly across all four mode × ingredients combinations.
5. **Manual — capacity flows:**
   - Place 3 orders for date D from a separate session.
   - Open `/cart` in a new browser, fill in items totalling 1 item, pick D → calendar visibly disables D after the availability fetch lands.
   - Force a race: select D before the fetch resolves (it greys after a tick). Submit → 400 → toast `此日期已額滿，請選擇其他日期` → calendar updates → user picks D+1 → submit succeeds.
   - Toggle admin to `不設定庫存` → reload `/cart` → all dates available again.
6. **Manual — storefront cap surface:**
   - Toggle admin to `每日總量 = 3`. Reload `/`. Every product card shows a `庫存 3` pill near 加入購物車.
   - Click into a product. The detail spec grid shows a `庫存 3` row alongside 重量 / 保鮮期 / 製作時間.
   - Toggle admin to `不設定庫存`. Reload both pages. **No card pill, no detail row.** Confirm via DOM inspection — there should be no `庫存` text anywhere on either page.
7. **Manual — ingredients:**
   - Edit one product, fill `成分（中文）` only. Reload its detail page in zh locale → `成分` row shows the value. Switch to en locale → row falls back to the same zh value.
   - Edit a different product, leave both ingredients fields blank. Reload its detail → `成分` row is absent.

## Dependencies

- Must complete after: `backend-api.md` (the new endpoint and the BE error contract must exist).
- Independent of: `admin-frontend.md`.

## Notes

- **Timezone caveat (acknowledged).** The picker compares a host-local date string against an Asia/Taipei date string. For users browsing from a non-Taipei timezone the two can disagree by one day. This is the same issue FEAT-10 already lives with for the `disabledWeekdays` matcher (it uses `d.getDay()` host-local). Out of scope for FEAT-13.
- **No optimistic UI for the calendar.** When the customer submits an order that succeeds, the calendar reflects the change on the *next* render via the invalidation, not synchronously. Acceptable because the success path navigates away from `/cart` to the order detail / success screen anyway.
- **No persistent "you booked the last slot" hint.** v1 just disables. If the owner asks for "1 left for tomorrow" copy, a follow-up ticket can extend the endpoint to return remaining capacity per date.
- **Submit button stays enabled** even when the chosen date is full at submit time. The toast + calendar redraw is the affordance that tells the user "pick another date and try again." Disabling the submit button conditionally on `fullDates` would re-introduce the same-date-twice race we already covered with the BE guard, with no UX win.
- **Why no FE pre-check inside the form's onSubmit?** Adding `if (fullDates.has(date)) return toast.error(...)` would be redundant with the calendar disable (the date can't be selected) *and* the BE 400 (if it slips through anyway). Two checks duplicate the rule and create a divergence risk; one disable + one defensive 400 is the right pair.
