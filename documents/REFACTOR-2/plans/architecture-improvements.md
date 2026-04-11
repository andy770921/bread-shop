# REFACTOR-2: Frontend Architecture — Deduplication & Deep Modules

## Problem

After REFACTOR-1 standardized API fetching patterns, several architectural friction points remain in the frontend. These fall into three categories:

1. **Copy-pasted logic** across pages and components (auth guards, status colors, add-to-cart handlers)
2. **Weak type safety** in new query hooks (local `any` types instead of `@repo/shared`)
3. **Shallow abstractions** that expose implementation details to every consumer

## Current State Audit

### 1. Auth Guard Duplication (3 pages)

Identical `useEffect` block pasted in every protected page:

```typescript
useEffect(() => {
  if (!authLoading && !user) {
    router.push('/auth/login');
  }
}, [authLoading, user, router]);
```

| File                          | Lines  |
| ----------------------------- | ------ |
| `app/orders/page.tsx`         | 40-44  |
| `app/orders/[id]/page.tsx`    | 46-50  |
| `app/profile/page.tsx`        | 28-32  |

Each page also independently handles the "still loading auth" skeleton and the `if (!user) return null` early exit. Adding a new protected page means copy-pasting all three pieces.

### 2. getStatusColor Duplication (2 files)

Identical 18-line `getStatusColor(status: OrderStatus)` function in:

| File                       | Lines |
| -------------------------- | ----- |
| `app/orders/page.tsx`      | 16-33 |
| `app/orders/[id]/page.tsx` | 20-37 |

Returns inline `React.CSSProperties` for each order status. No shared utility.

### 3. Add-to-Cart Handler Duplication (2 components)

Identical handler pattern in both product display components:

```typescript
const handleAddToCart = (productId: number) => {
  const product = products.find((p) => p.id === productId);
  if (!product) return;
  addToCart(productId, product.price);
  toast.success(t('home.addedToCart'));
};
```

| File                              | Lines |
| --------------------------------- | ----- |
| `components/product/product-grid.tsx`     | 25-30 |
| `components/product/product-showcase.tsx` | 20-25 |

Both also independently instantiate `useAddToCart` with the same error handler.

### 4. Weak Types in New Query Hooks

REFACTOR-1 created three new hook files but used local interfaces and `any` instead of shared types:

| File                    | Issue                                              |
| ----------------------- | -------------------------------------------------- |
| `queries/use-orders.ts` | Local `OrderListResponse` with `orders: any[]`     |
| `queries/use-orders.ts` | `useOrder()` returns untyped `any`                 |
| `queries/use-checkout.ts` | `useCreateOrder` returns `any`; local `LineSendResponse` missing `needs_friend`/`add_friend_url` |
| `queries/use-profile.ts` | `useUpdateProfile` returns `any`                  |

All these types already exist in `@repo/shared` (`Order`, `OrderListResponse`, `CreateOrderRequest`, `LineSendResponse`).

## Strategy

### A. `useAuthGuard()` hook — Deep module for protected routes

Create `hooks/use-auth-guard.ts` that encapsulates:
- Auth loading check
- Redirect to login
- Return `{ user, isReady }` — pages only render when `isReady && user`

**What it hides:** Router import, useEffect wiring, loading state management, redirect target.

### B. `getStatusColor()` shared utility

Move to `utils/order.ts`. Single source of truth imported by both order pages.

### C. `useAddToCartHandler()` hook

Create `hooks/use-add-to-cart-handler.ts` that encapsulates:
- `useAddToCart()` with standard error toast
- Product lookup + price extraction
- Success toast

**What it hides:** Toast messages, error handling, product-to-price resolution.

### D. Fix shared types

Replace local interfaces in `use-orders.ts`, `use-checkout.ts`, `use-profile.ts` with imports from `@repo/shared`. Add proper generic types to eliminate `any`.

## Out of Scope

- **Header decomposition** — While the Header has 8 hooks/6 concerns, it works and touching it risks layout regressions. Better as a separate REFACTOR ticket.
- **Backend architecture** (session resolution, Supabase query layer, LINE message builder) — Documented as future candidates but not safe to bundle with frontend changes.
- **Auth context refactor** — The auth-context works; its coupling to query cache is a known trade-off.
