# FIX-1: Cart Page +/- CTA — Optimistic + Debounce

## Problem

Clicking the +/- quantity buttons on `/cart` was slow — the UI only updated after the server round-trip completed. Each click sent an immediate `PATCH /api/cart/items/:id` and waited for the response before reflecting the new quantity.

The same problem applied to the trash (remove) button — the item visually remained until the `DELETE` response returned.

## Root Cause

`useUpdateCartItem()` was a plain `useMutation` with no optimistic update and no debounce:

```typescript
// BEFORE
export function useUpdateCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: number; quantity: number }) =>
      authedFetchFn<CartResponse>(`api/cart/items/${itemId}`, {
        method: 'PATCH',
        body: { quantity },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['cart'], data);
    },
  });
}
```

Every click → 1 network request → wait → UI update. Rapid clicks (e.g., 3→8) sent 5 sequential PATCH requests.

`useRemoveCartItem()` had the same issue — no optimistic update.

## Fix — Option D: Optimistic UI + Debounced API Call

Applied the same pattern already used by `useAddToCart()` (product page "Add to Cart").

### `useUpdateCartItem()` — Rewritten

| Aspect | Before | After |
|--------|--------|-------|
| UI update timing | After server response | Instant (optimistic) |
| Requests per burst (e.g., 5 clicks) | 5 PATCH requests | 1 PATCH request |
| Debounce | None | 500ms |
| Error handling | None (silent) | Rollback to server state |

Flow:
1. On each click → immediately update TanStack Query cache with new quantity + recalculated totals
2. Start/reset a 500ms debounce timer keyed by `itemId`
3. When timer fires → send one PATCH with the final target quantity
4. On success → reconcile cache with server response (re-apply any still-pending items)
5. On error → rollback cache to last known server state

New helper `applyPendingUpdates()` overlays pending absolute quantities onto a server response — simpler than `reconcileWithPending()` (used by addToCart) because update uses absolute quantities, not deltas.

### `useRemoveCartItem()` — Added Optimistic Update

Uses TanStack Query's standard `onMutate` / `onError` rollback pattern:
- `onMutate`: cancel in-flight cart queries, snapshot previous cart, optimistically remove item from cache
- `onError`: restore snapshot
- `onSuccess`: reconcile with server response

### Cart Page (`app/cart/page.tsx`)

Minimal change — updated to use the new hook API:

```typescript
// BEFORE
const updateCartItem = useUpdateCartItem();
updateCartItem.mutate({ itemId, quantity: newQuantity });

// AFTER
const { updateItem } = useUpdateCartItem();
updateItem(itemId, newQuantity);
```

## Shared Logic

Both `useAddToCart` and `useUpdateCartItem` share:
- `PendingEntry` interface — `{ quantity, timer }`
- `recalcCartTotals()` — recomputes subtotal, shipping, total, item_count from items array

They use separate reconciliation helpers because the semantics differ:
- `reconcileWithPending()` (addToCart): pending quantities are **deltas** to add; must handle items not yet on server
- `applyPendingUpdates()` (updateCartItem): pending quantities are **absolute targets**; items always exist on server

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/queries/use-cart.ts` | Rewrote `useUpdateCartItem` with optimistic+debounce; added `applyPendingUpdates` helper; added optimistic update to `useRemoveCartItem` |
| `frontend/src/app/cart/page.tsx` | Updated to use `{ updateItem }` destructured API |
