# Implementation Plan: Customer Frontend

## Overview

The customer frontend stops importing `CART_CONSTANTS.SHIPPING_FEE` / `CART_CONSTANTS.FREE_SHIPPING_THRESHOLD` and reads the same values through a new `useShopSettings()` hook backed by `GET /api/shop-settings`. The home page conditionally renders `<SeasonalBanner />` based on `shopSettings.promoBannerEnabled`. Optimistic cart math (`recalcCartTotals`) accepts settings as an argument.

The wire shape of `CartResponse` and `Order` is unchanged — only the *source* of the numeric `shipping_fee` shifts from a build-time constant to a server-driven value.

## Files to Modify

### New files

- `frontend/src/queries/use-shop-settings.ts` — TanStack Query hook for `GET /api/shop-settings`.
- `frontend/src/components/layout/seasonal-banner.spec.tsx` — banner gating test.

### Modified files

- `frontend/src/components/layout/seasonal-banner.tsx` — gate render on `promoBannerEnabled`.
- `frontend/src/utils/cart-math.ts` — accept `ShopSettings` argument; drop `CART_CONSTANTS` import for shipping.
- `frontend/src/utils/cart-math.spec.ts` — update existing assertions; add `shippingEnabled=false` case.
- `frontend/src/queries/use-cart.ts` — read `useShopSettings()` and thread it into `recalcCartTotals` call sites.
- `frontend/src/app/cart/page.tsx` — show shipping line as `cart.shipping_fee` (already does); also surface the "再買 NT$ X 即可享免運" hint using settings.freeShippingThreshold rather than the constant. *(Only if the cart page currently displays such a hint — confirm during implementation.)*
- `frontend/src/app/page.tsx` — no change; the conditional logic lives inside `<SeasonalBanner />`.
- Test files that asserted hard-coded `60` / `500` shipping (`frontend/src/app/cart/page.spec.tsx`, `frontend/src/queries/cart-session.spec.ts`, `frontend/src/utils/cart-math.spec.ts`) now seed `shopSettings` in their test fixtures.

## Step-by-Step Implementation

### Step 1: `useShopSettings` hook

**File:** `frontend/src/queries/use-shop-settings.ts` (new)

```ts
import { useQuery } from '@tanstack/react-query';
import type { ShopSettings } from '@repo/shared';

const KEY = ['api', 'shop-settings'] as const;

export function useShopSettings() {
  return useQuery<ShopSettings>({
    queryKey: KEY,
    staleTime: 5 * 60_000, // 5 min — admin changes propagate within ~5 min
  });
}
```

**Rationale:**

- Long `staleTime` keeps the customer experience fast; admin edits propagate via background refetch on the next visit. Short staleness is unnecessary — owner-driven knobs change at minute-to-hour cadence, not seconds.
- The default `queryFn` from `frontend/src/vendors/tanstack-query/provider.tsx` already serializes `['api','shop-settings']` to the path `/api/shop-settings`. No custom `queryFn` needed.

### Step 2: Banner gating

**File:** `frontend/src/components/layout/seasonal-banner.tsx`

```tsx
'use client';

import { useLocale } from '@/hooks/use-locale';
import { useShopSettings } from '@/queries/use-shop-settings';

export function SeasonalBanner() {
  const { t } = useLocale();
  const { data: settings } = useShopSettings();

  if (!settings || settings.promoBannerEnabled === false) return null;

  return (
    <div
      className="py-2 text-center text-sm font-medium tracking-wide"
      style={{ background: 'var(--banner-gradient)', color: '#fff' }}
    >
      {t('banner.text')}
    </div>
  );
}
```

**Rationale:**

- During the initial query (no `data`), the banner stays hidden. This is the *safer* default — flashing a banner that the owner has switched off would be more jarring than briefly omitting it from a page load that already has its own loading states.
- The `{t('banner.text')}` source remains unchanged, so the existing site-content override flow (admin 文案設定 → `useSiteContent` → `useLocale().t`) still applies.

### Step 3: Refactor `recalcCartTotals`

**File:** `frontend/src/utils/cart-math.ts`

```ts
import { CartResponse, ShopSettings } from '@repo/shared';

export interface PendingCartEntry { quantity: number; }

export const EMPTY_CART: CartResponse = Object.freeze({
  cart_id: null,
  version: 0,
  items: [],
  subtotal: 0,
  shipping_fee: 0,
  total: 0,
  item_count: 0,
});

export function recalcCartTotals(
  items: CartResponse['items'],
  settings: ShopSettings,
  meta?: Partial<Pick<CartResponse, 'cart_id' | 'version'>>,
): CartResponse {
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const shipping_fee =
    !settings.shippingEnabled
      ? 0
      : subtotal === 0
        ? 0
        : subtotal >= settings.freeShippingThreshold
          ? 0
          : settings.shippingFee;
  return {
    cart_id: meta?.cart_id ?? null,
    version: meta?.version ?? 0,
    items,
    subtotal,
    shipping_fee,
    total: subtotal + shipping_fee,
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export function reconcileWithPending(
  serverCart: CartResponse,
  pending: ReadonlyMap<number, PendingCartEntry>,
  settings: ShopSettings,
  optimisticCache?: CartResponse,
): CartResponse {
  /* same merge logic; final return is recalcCartTotals(items, settings, serverCart) */
}

export function applyPendingUpdates(
  cart: CartResponse,
  pending: ReadonlyMap<number | string, PendingCartEntry>,
  settings: ShopSettings,
): CartResponse {
  /* same logic; final return is recalcCartTotals(items, settings, cart) */
}
```

**Rationale:**

- Settings are passed in rather than queried from inside the function — the function stays pure and trivially testable. Callers (the cart query hook) already have `useShopSettings()` available.
- The compute branches mirror the backend's `cart.service.ts` ordering exactly (disabled → empty → above-threshold → fee). Keeping the two implementations symmetric prevents drift between optimistic and server-truth values.

### Step 4: Thread settings through `use-cart.ts`

**File:** `frontend/src/queries/use-cart.ts`

A grep for `recalcCartTotals|reconcileWithPending|applyPendingUpdates` in `use-cart.ts` returns **five call sites**, not two: the top-level `import` plus four invocations at approximately lines 59, 69, 96, 114, 138. Every invocation must thread the `settings` argument. The function signatures must be pinned exactly so existing callers do not silently break — the pre-FEAT-12 `reconcileWithPending(serverCart, pending, optimisticCache?)` already takes three positional args, so insert `settings` between `pending` and `optimisticCache?` and update **every call site** in lock-step.

Final signatures (insert `settings` as the second-to-last positional, keeping `meta` / `optimisticCache?` last):

```ts
recalcCartTotals(items, settings, meta?)
reconcileWithPending(serverCart, pending, settings, optimisticCache?)
applyPendingUpdates(cart, pending, settings)
```

`use-cart.ts` skeleton — pull `useShopSettings()` once at the top of the hook and reuse the resolved value (or a fallback) at every call site:

```ts
import type { ShopSettings } from '@repo/shared';
import { useShopSettings } from './use-shop-settings';

const FALLBACK_SETTINGS: ShopSettings = {
  shippingEnabled: true,
  shippingFee: 60,
  freeShippingThreshold: 500,
  promoBannerEnabled: true,
};

export function useCart() {
  const { data: shopSettings } = useShopSettings();
  const settings = shopSettings ?? FALLBACK_SETTINGS;
  // every recalcCartTotals / applyPendingUpdates / reconcileWithPending invocation
  // below now passes `settings` in its new positional slot.
}
```

**Rationale:**

- The fallback exists so the very first render before `useShopSettings` resolves still produces a sane number. The seed row in `database-schema.md` Step 1 uses the same numbers, so under normal conditions there is no observable jump from fallback to live data.
- Pinning the new signatures here lets the implementer mechanically sweep the file with confidence. **Do not reorder** existing positional arguments — only insert `settings` in the documented slot. A reordering bug here is silent (TypeScript will not catch it because the existing positional types are similar) and shows up in production as wrong totals.

### Step 5: Drop the constants

**File:** `shared/src/constants/cart.ts`

Already covered in `backend-api.md` Step 1 — the file collapses to just `MAX_ITEM_QUANTITY: 99`. After this change runs, the customer frontend's TypeScript compiler will surface every site that imported the deleted constants. The expected list is:

- `frontend/src/utils/cart-math.ts:1,22-27` — refactored in Step 3.
- `frontend/src/utils/cart-math.spec.ts:1,36-37,58` — refactored in Step 6.
- `frontend/src/queries/use-cart.ts:1` — only `MAX_ITEM_QUANTITY` is still imported; leave that import.

If any other files surface during build, walk each one:

- if it consumes the constant for clamping (e.g. `MAX_ITEM_QUANTITY`), no change;
- if it consumes one of the shipping constants, replace with the settings-driven path.

### Step 6: Test fixture updates

**File:** `frontend/src/utils/cart-math.spec.ts`

Replace the two existing assertions:

```ts
import { CART_CONSTANTS } from '@repo/shared';
// ...
expect(cart.shipping_fee).toBe(CART_CONSTANTS.SHIPPING_FEE);
expect(cart.total).toBe(400 + CART_CONSTANTS.SHIPPING_FEE);
```

…with explicit numeric expectations driven by a test fixture:

```ts
const SETTINGS = {
  shippingEnabled: true, shippingFee: 60, freeShippingThreshold: 500, promoBannerEnabled: true,
};
// ...
const cart = recalcCartTotals(items, SETTINGS);
expect(cart.shipping_fee).toBe(60);
expect(cart.total).toBe(460);
```

Add a third case for `shippingEnabled: false` returning `shipping_fee: 0` even at `subtotal: 100`.

**File:** `frontend/src/queries/cart-session.spec.ts` and `frontend/src/app/cart/page.spec.tsx`

These already hard-code `shipping_fee: 60` / `shipping_fee: 0` directly in the cart fixture objects (verified in the Codebase Verification step). Those values reflect the *response shape*, not the constant — so as long as the test continues to inject the same `60` / `0`, the assertions still pass. **No change needed for these two files** beyond confirming during implementation that the imports remain valid (none of them import `CART_CONSTANTS.SHIPPING_FEE`).

### Step 7: Banner test

**File:** `frontend/src/components/layout/seasonal-banner.spec.tsx` (new)

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SeasonalBanner } from './seasonal-banner';

function withClient(ui: React.ReactNode, settings: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['api', 'shop-settings'], settings);
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SeasonalBanner', () => {
  it('renders banner.text when promoBannerEnabled is true', () => {
    withClient(<SeasonalBanner />, {
      shippingEnabled: true, shippingFee: 60, freeShippingThreshold: 500, promoBannerEnabled: true,
    });
    expect(screen.getByText(/限時優惠|Limited Offer/)).toBeInTheDocument();
  });

  it('renders nothing when promoBannerEnabled is false', () => {
    const { container } = withClient(<SeasonalBanner />, {
      shippingEnabled: true, shippingFee: 60, freeShippingThreshold: 500, promoBannerEnabled: false,
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing during initial loading', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}><SeasonalBanner /></QueryClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

**Rationale:** The third case codifies the no-flash decision from Step 2 — if `useShopSettings()` is loading, render nothing rather than the banner.

## Testing Steps

1. **Type check:** `cd frontend && npx tsc --noEmit` — should pass after Steps 1–5.
2. **Unit:** `cd frontend && npx jest src/utils src/queries src/components/layout` — three suites, each with the updated/new cases above.
3. **Manual:**
   - Run `npm run dev`, open `http://localhost:3001`. Banner renders with default settings.
   - In the admin app, switch promo banner off. Reload the customer home — banner is gone.
   - Switch shipping off. Open the cart with two items (subtotal < 500) — `shipping_fee: 0` at the line item, `total = subtotal`.
   - Re-enable, raise threshold to `1000`. Cart with subtotal `600` now shows shipping; cart with subtotal `1000` shows free shipping.

## Dependencies

- Must complete after: `backend-api.md` (the public endpoint must exist for `useShopSettings` to resolve in dev).
- Independent of: `admin-frontend.md` (the admin page can ship before or after the customer FE; both depend on backend).

## Notes

- **Cookie-style preview banner override** is out of scope. There is no per-customer "I've dismissed this banner" state; turning it off in admin hides it for everyone.

- **Cart-page hint copy must be de-hard-coded.** The i18n strings `cart.freeShippingNote` in `shared/src/i18n/zh.json:53` and `en.json:53` currently read `"滿NT$500免運費"` / `"Free shipping on orders over NT$500"`. They are rendered verbatim by `frontend/src/app/cart/page.tsx:598` whenever `shippingFee > 0`. Once the threshold becomes admin-configurable, leaving those strings as-is would show "NT$500" while the actual threshold is some other number — actively misleading. Two acceptable fixes (pick one during implementation):

  - **(a) Token-replace at render time.** Change the JSON values to use a placeholder, e.g. `"滿NT${threshold}免運費"` / `"Free shipping on orders over NT${threshold}"`, then in `cart/page.tsx` do `t('cart.freeShippingNote').replace('{threshold}', String(settings.freeShippingThreshold))`. Minimal churn.
  - **(b) Compute the message inline.** Drop `freeShippingNote` from the JSON, render `t('cart.freeShippingPrefix') + 'NT$' + settings.freeShippingThreshold + t('cart.freeShippingSuffix')` (or similar). More keys, more flexibility.

  Either way the hard-coded `500` in the translation strings must be removed in this ticket. Not optional.

- **`shipping_fee` test fixtures across the backend test tree.** The grep `shipping_fee:\s*60` returns four backend files: `cart/cart.service.spec.ts`, `order/order.service.spec.ts`, `checkout/checkout.service.spec.ts:20`, and `auth/auth.controller.spec.ts:188,249,284` (plus `:215` with `shipping_fee: 0`). The first two are migrated in `backend-api.md` Step 5; the last two are response-shape fixtures (mocking what `cart.service` returns to a *consumer*) and continue to work as-is — they do **not** need to change. Listing them here so the implementer is not surprised when these greps come back hot but the tests stay green.

- **SSR/CSR consistency for `<SeasonalBanner />`.** `frontend/src/app/page.tsx` is annotated `'use client'`, so the entire home page hydrates as a client component. There is no SSR/CSR divergence today — the server-rendered HTML and the first client render both run inside the client tree, and `useShopSettings()` returns `undefined` on first paint either way. **If a future ticket migrates the home page to a server component (or hoists a section into RSC)**, this banner will need either a server-side prefetch into the QueryClient cache or an explicit `<Suspense>` boundary, otherwise hydration warnings will reappear. Documented here so an RSC migration does not silently regress this gate.
