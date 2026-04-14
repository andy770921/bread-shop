# FIX-1: Implementation — Cart Badge Race Condition Fix

## Approach A: Delay `pending.delete()` (Chosen — Implement Now)

### Principle

Don't remove an item's pending entry until **after** the API response has been processed and reconciled. Only delete if the user hasn't changed their intent during the request (i.e., `sentQty === currentPendingQty`).

### Changes to `useUpdateCartItem`

**Before (buggy):**

```typescript
p.timer = setTimeout(async () => {
    const qty = p.quantity;
    pending.delete(itemId);     // ← deleted BEFORE API call

    try {
      const serverCart = await authedFetchFn(`api/cart/items/${itemId}`, {
        method: 'PATCH',
        body: { quantity: qty },
      });
      serverCartRef.current = serverCart;
      queryClient.setQueryData(['cart'], applyPendingUpdates(serverCart, pending));
      if (pending.size === 0) serverCartRef.current = null;
    } catch {
      const rollback = serverCartRef.current ?? { ...EMPTY_CART, items: [] };
      queryClient.setQueryData(['cart'], applyPendingUpdates(rollback, pending));
      if (pending.size === 0) serverCartRef.current = null;
    }
}, 500);
```

**After (fixed):**

```typescript
p.timer = setTimeout(async () => {
    const sentQty = p.quantity;
    // DO NOT delete from pending here — keep entry alive during API call

    try {
      const serverCart = await authedFetchFn(`api/cart/items/${itemId}`, {
        method: 'PATCH',
        body: { quantity: sentQty },
      });
      serverCartRef.current = serverCart;

      // Only delete if user hasn't clicked again during the request
      if (pending.get(itemId)?.quantity === sentQty) {
        pending.delete(itemId);
      }

      queryClient.setQueryData(['cart'], applyPendingUpdates(serverCart, pending));
      if (pending.size === 0) serverCartRef.current = null;
    } catch {
      // On error: only rollback this item if intent hasn't changed
      if (pending.get(itemId)?.quantity === sentQty) {
        pending.delete(itemId);
      }
      const rollback = serverCartRef.current ?? { ...EMPTY_CART, items: [] };
      queryClient.setQueryData(['cart'], applyPendingUpdates(rollback, pending));
      if (pending.size === 0) serverCartRef.current = null;
    }
}, 500);
```

### Changes to `useAddToCart`

Same pattern — move `pending.delete(productId)` to after the API response with a `sentQty` guard.

**Before (buggy):**

```typescript
p.timer = setTimeout(async () => {
    const qty = p.quantity;
    pending.delete(productId);    // ← deleted BEFORE API call

    try {
      const serverCart = await authedFetchFn('api/cart/items', { ... });
      serverCartRef.current = serverCart;
      const currentCache = queryClient.getQueryData<CartResponse>(['cart']);
      queryClient.setQueryData(['cart'], reconcileWithPending(serverCart, pending, currentCache));
    } catch {
      const rollback = serverCartRef.current ?? { ...EMPTY_CART, items: [] };
      const cache = queryClient.getQueryData<CartResponse>(['cart']);
      queryClient.setQueryData(['cart'], reconcileWithPending(rollback, pending, cache));
      onErrorRef.current?.();
    }
}, 500);
```

**After (fixed):**

```typescript
p.timer = setTimeout(async () => {
    const sentQty = p.quantity;
    // DO NOT delete from pending here

    try {
      const serverCart = await authedFetchFn('api/cart/items', {
        method: 'POST',
        body: { product_id: productId, quantity: sentQty },
      });
      serverCartRef.current = serverCart;

      if (pending.get(productId)?.quantity === sentQty) {
        pending.delete(productId);
      }

      const currentCache = queryClient.getQueryData<CartResponse>(['cart']);
      queryClient.setQueryData(['cart'], reconcileWithPending(serverCart, pending, currentCache));
    } catch {
      if (pending.get(productId)?.quantity === sentQty) {
        pending.delete(productId);
      }
      const rollback = serverCartRef.current ?? { ...EMPTY_CART, items: [] };
      const cache = queryClient.getQueryData<CartResponse>(['cart']);
      queryClient.setQueryData(['cart'], reconcileWithPending(rollback, pending, cache));
      onErrorRef.current?.();
    }
}, 500);
```

### Why This Works — Multi-Item Scenario Walkthrough

Item A (qty=3), Item B (qty=2). Header badge: 5.

| Time | Event | `pending` Map | Header |
|------|-------|---------------|--------|
| t=0 | Click + on A | `{A: {qty:4}}` | **6** |
| t=100ms | Click + on B | `{A: {qty:4}, B: {qty:3}}` | **7** |
| t=500ms | Timer A fires, PATCH A sent | `{A: {qty:4}, B: {qty:3}}` (A kept!) | **7** |
| t=600ms | Timer B fires, PATCH B sent | `{A: {qty:4}, B: {qty:3}}` (B kept!) | **7** |
| t=~800ms | PATCH A response {A:4, B:2} | | |
| | `sentQty(4) === pending.get(A).qty(4)` → delete A | `{B: {qty:3}}` | |
| | `applyPendingUpdates({A:4,B:2}, {B:3})` → {A:4, B:3} | | **7** (no drop!) |
| t=~900ms | PATCH B response {A:4, B:3} | | |
| | `sentQty(3) === pending.get(B).qty(3)` → delete B | `{}` | |
| | `applyPendingUpdates({A:4,B:3}, {})` → {A:4, B:3} | | **7** |

### Edge Case: User Clicks Again During API Call

1. Timer fires for item A with `sentQty=4`, PATCH sent
2. User clicks + on A → `pending.get(A).qty = 5`, new timer starts
3. PATCH A response arrives: `sentQty(4) !== pending.get(A).qty(5)` → **don't delete**
4. `applyPendingUpdates(server{A:4}, {A:{qty:5}})` → A=5 (user intent preserved)
5. New timer fires → PATCH with qty=5
6. Response: `sentQty(5) === pending.get(A).qty(5)` → delete, converged

### Files Changed

| File | Change |
|------|--------|
| `frontend/src/queries/use-cart.ts` | Move `pending.delete()` to after API response in both `useUpdateCartItem` and `useAddToCart`; add `sentQty` guard condition |

---

## Approach B: Separate Local State (Fallback — If Approach A Insufficient)

### Principle

Decouple the displayed quantity from the TanStack Query cache entirely. Maintain a **separate intent store** (React ref or state) that represents what the user wants. The displayed value always comes from this store when it has an entry; otherwise falls back to the query cache. Only clear the intent store when the server confirms the same value.

### Design

```typescript
// Intent store: Map<itemId, targetQuantity>
const intentRef = useRef<Map<number, number>>(new Map());

// Display logic (in component):
const displayQty = intentRef.current.get(item.id) ?? item.quantity;

// On click +:
intentRef.current.set(itemId, newQty);
// Trigger re-render (via state setter or cache update)

// After API response:
if (serverQty === intentRef.current.get(itemId)) {
    intentRef.current.delete(itemId);  // Converged — clear intent
    queryClient.setQueryData(['cart'], serverCart);  // Trust server
} else {
    // User clicked again during request — re-send
    debouncedPatch(itemId, intentRef.current.get(itemId));
}
```

### Key Differences from Approach A

| Aspect | Approach A | Approach B |
|--------|-----------|-----------|
| Display source | TanStack Query cache (updated optimistically) | Intent store with cache fallback |
| Vulnerability to external cache writes | Possible: other code calling `setQueryData(['cart'])` could overwrite | Immune: display reads from intent store, not cache |
| Implementation scope | 2 hooks modified (~6 lines each) | Hooks + components modified; display logic changes |
| Convergence | Implicit via debounce + pending Map | Explicit loop: compare → re-send → compare |
| When to use | First-line fix; sufficient for the identified multi-item race | If Approach A still shows drops due to other cache writers (e.g., `invalidateQueries`, auth context, etc.) |

### Implementation Steps (If Needed)

1. Add `intentRef: Map<number, number>` to `useUpdateCartItem`
2. On each click: set intent, update cache optimistically (same as now)
3. On API response: compare `serverQty` to `intentRef.get(itemId)`
   - Match → delete from intent, set cache to server response
   - Mismatch → keep intent, schedule re-send via debounce
4. Export `intentRef` (or a getter) so the cart page component can read display values from it
5. Cart page: use `intentRef.get(item.id) ?? item.quantity` for display
6. Header: continues to read from TanStack cache (which will be correct once converged, and the brief inconsistency in the badge is acceptable)

### When to Escalate to Approach B

- Approach A is deployed but the badge still drops in production
- New features introduce additional `setQueryData(['cart'])` or `invalidateQueries(['cart'])` calls that interfere with optimistic updates
- The cart page is embedded in a layout that causes frequent re-mounts (triggering query refetches despite staleTime)
