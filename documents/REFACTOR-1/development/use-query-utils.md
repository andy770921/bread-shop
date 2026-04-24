# REFACTOR-1: Implementation Steps

## Step 1 — Fix fetcher utility to include credentials

**File:** `utils/fetchers/fetchers.utils.ts`

Add `credentials: 'include'` in `getFetchQueryOptions` so session cookies are sent automatically.

## Step 2 — Add authedFetchFn

**File:** `utils/fetchers/fetchers.client.ts`

Add `authedFetchFn` that wraps `defaultFetchFn`, injecting the Bearer token from localStorage into headers. This replaces the manual `getAuthHeaders()` + `credentials: 'include'` pattern.

## Step 3 — Create `queries/use-orders.ts`

Extract inline useQuery calls from:

- `app/orders/page.tsx` → `useOrders()`
- `app/orders/[id]/page.tsx` → `useOrder(orderId)`

Both use `authedFetchFn` internally.

## Step 4 — Create `queries/use-checkout.ts`

Extract checkout mutations from `app/cart/page.tsx`:

- `useCreateOrder()` — POST /api/orders
- `useLineSend(orderId)` — POST /api/orders/:id/line-send
- `useConfirmOrder(orderId)` — POST /api/orders/:id/confirm

All use `authedFetchFn` with `method: 'POST'`.

## Step 5 — Create `queries/use-profile.ts`

Extract profile mutation from `app/profile/page.tsx`:

- `useUpdateProfile()` — PATCH /api/user/profile

Uses `authedFetchFn` with `method: 'PATCH'`.

## Step 6 — Migrate existing query hooks

Update these files to replace raw `fetch` with `defaultFetchFn` / `authedFetchFn`:

- `queries/use-cart.ts` — useCart queryFn, useUpdateCartItem, useRemoveCartItem, and the fetch inside useAddToCart
- `queries/use-products.ts` — useProducts queryFn
- `queries/use-favorites.ts` — useFavorites queryFn, useToggleFavorite mutationFn
- `queries/use-categories.ts` — useCategories queryFn

## Step 7 — Migrate auth-context.tsx

Replace raw `fetch` in `fetchUser`, `login`, `register`, `logout` with `defaultFetchFn` / `authedFetchFn`.

## Step 8 — Update page components

- `app/cart/page.tsx` — replace handleCheckout raw fetch with hooks from Step 4
- `app/profile/page.tsx` — replace handleSave raw fetch with hook from Step 5
- `app/orders/page.tsx` — replace inline useQuery with hook from Step 3
- `app/orders/[id]/page.tsx` — replace inline useQuery with hook from Step 3

## Step 9 — Clean up

- Remove `lib/api.ts` (`getAuthHeaders`) if no longer imported anywhere
- Remove `const API_URL = ''` from page files that no longer use raw fetch

## File change summary

| File                                | Action                                                 |
| ----------------------------------- | ------------------------------------------------------ |
| `utils/fetchers/fetchers.utils.ts`  | Add `credentials: 'include'`                           |
| `utils/fetchers/fetchers.client.ts` | Add `authedFetchFn`                                    |
| `queries/use-orders.ts`             | **New** — useOrders, useOrder                          |
| `queries/use-checkout.ts`           | **New** — useCreateOrder, useLineSend, useConfirmOrder |
| `queries/use-profile.ts`            | **New** — useUpdateProfile                             |
| `queries/use-cart.ts`               | Migrate fetch → authedFetchFn                          |
| `queries/use-products.ts`           | Migrate fetch → defaultFetchFn                         |
| `queries/use-favorites.ts`          | Migrate fetch → authedFetchFn                          |
| `queries/use-categories.ts`         | Migrate fetch → defaultFetchFn                         |
| `lib/auth-context.tsx`              | Migrate fetch → defaultFetchFn/authedFetchFn           |
| `app/cart/page.tsx`                 | Use hooks from use-checkout.ts                         |
| `app/profile/page.tsx`              | Use hook from use-profile.ts                           |
| `app/orders/page.tsx`               | Use hook from use-orders.ts                            |
| `app/orders/[id]/page.tsx`          | Use hook from use-orders.ts                            |
| `lib/api.ts`                        | Remove if unused                                       |
