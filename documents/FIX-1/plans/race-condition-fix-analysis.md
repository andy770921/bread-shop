# FIX-1: Deep Analysis — Cart Badge Temporary Drop (Optimistic Update Race)

## Symptom

After implementing Optimistic + Debounce (Option D from fix-plan.md), clicking the +/- buttons on `/cart` now updates the UI instantly. However, **sometimes** the header cart badge number first increases correctly, then **drops back down** briefly, before restoring to the correct value.

Pattern: `5 → 6 → 7 → 6 → 7` (the 7→6 drop is the bug).

---

## Root Cause: `pending.delete()` Executes Before API Response

Both `useUpdateCartItem` and `useAddToCart` share the same bug pattern in their debounce callback:

```typescript
p.timer = setTimeout(async () => {
    const qty = p.quantity;
    pending.delete(itemId);     // BUG: deleted BEFORE the async API call

    try {
      const serverCart = await authedFetchFn(...);  // takes ~200-500ms
      queryClient.setQueryData(['cart'], applyPendingUpdates(serverCart, pending));
      //                                              pending is EMPTY here ↑
```

The `pending` Map is the hook's record of "what the user intends that the server doesn't know yet." Deleting an entry before the API call means that when **another** item's API response arrives first, the reconciliation function (`applyPendingUpdates` / `reconcileWithPending`) cannot find the deleted entry and falls back to the server's stale value.

### Detailed Reproduction — Two Items on Cart Page

**Setup:** Item A (qty=3), Item B (qty=2). Header badge: **5**.

| Time     | Event                                                            | `pending` Map              | Cache `item_count` | Header           |
| -------- | ---------------------------------------------------------------- | -------------------------- | ------------------ | ---------------- |
| t=0      | Click + on A → optimistic update                                 | `{A: {qty:4}}`             | 6                  | **6**            |
| t=100ms  | Click + on B → optimistic update                                 | `{A: {qty:4}, B: {qty:3}}` | 7                  | **7**            |
| t=500ms  | Timer A fires → `pending.delete(A)`, PATCH A sent                | `{B: {qty:3}}`             | 7                  | **7**            |
| t=600ms  | Timer B fires → `pending.delete(B)`, PATCH B sent                | `{}` **(empty!)**          | 7                  | **7**            |
| t=~800ms | PATCH A response arrives: server returns `{A:4, B:2}`            | `{}`                       | —                  | —                |
|          | `applyPendingUpdates(server, empty_pending)` → uses server as-is |                            | **6**              | **6 (DROPPED!)** |
| t=~900ms | PATCH B response arrives: server returns `{A:4, B:3}`            | `{}`                       | —                  | —                |
|          | `applyPendingUpdates(server, empty_pending)` → uses server as-is |                            | **7**              | **7 (restored)** |

**The header badge path: 5 → 6 → 7 → 6 → 7.** The drop from 7 to 6 is caused by PATCH A's response arriving before PATCH B's response. The server's response for A doesn't include B's update yet (B's PATCH is still in-flight), and the reconciliation can't overlay B's intent because B was already deleted from pending.

### Why It Doesn't Always Happen

The bug requires:

1. **Two or more different items** being updated in a close time window (same item updates are collapsed by the debounce, so only one PATCH fires)
2. **The PATCH responses arriving in order** where an earlier response doesn't reflect a later item's update (normal behavior since each PATCH only modifies one item)

If the user only clicks + on a single item, the debounce correctly collapses all clicks into one PATCH — no race. The bug is specific to **multiple items with overlapping in-flight PATCH requests**.

### Same Bug in `useAddToCart`

`useAddToCart` has the identical pattern at line 150:

```typescript
pending.delete(productId); // BEFORE API call
```

If a user adds Product X and Product Y rapidly from the product listing, Product Y's optimistic entry gets lost when Product X's POST response arrives first.

---

## Ruled-Out Causes

### TanStack Query Background Refetch

The global `staleTime: 60s` (configured in `vendors/tanstack-query/provider.tsx`) means the `['cart']` query won't auto-refetch for 60 seconds after any `setQueryData` call. Additionally, `setQueryData` resets `dataUpdatedAt`, so each optimistic update extends the freshness window. Background refetch is **not** the cause during normal rapid clicking.

### Backend PATCH Semantics

The backend `cart.service.ts:updateItem()` uses `.update({ quantity })` — a direct SET, not an increment. When the frontend sends `PATCH { quantity: 6 }`, the server sets the quantity to exactly 6. The server response is accurate for the item it updated; it simply doesn't reflect other items' in-flight updates.

### Cross-Hook Interference

On the cart page, only `useUpdateCartItem` is active. `useAddToCart` is used on product pages. Each has its own `pendingRef` and `serverCartRef`. They don't interfere with each other on the same page.

---

## Solution Approaches

### Approach A: Delay `pending.delete()` Until After API Confirmation (Chosen)

Keep the pending entry alive during the API call. Only delete after the response arrives, and only if the user hasn't clicked again during the request (i.e., the sent quantity still matches the pending quantity).

See: `documents/FIX-1/development/race-condition-deep-implementation.md` — Approach A.

### Approach B: Separate Local State for Display Intent (Fallback)

Decouple the display value from the TanStack Query cache. Maintain a separate "intent" state that is only cleared when the server confirms the same value. If the server returns a different value, re-send.

See: `documents/FIX-1/development/race-condition-deep-implementation.md` — Approach B.

### Comparison

|                       | A: Delay pending.delete                                                   | B: Separate local state                                               |
| --------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Core idea             | Keep entry in existing `pending` Map until API confirms                   | Maintain a separate intent store; only clear on server match          |
| Convergence mechanism | Implicit: debounce timer fires with latest pending value                  | Explicit: compare server response to local state, re-send if mismatch |
| Robustness            | Handles multi-item races; still uses TanStack cache for display           | More defensive: immune to any external cache overwrite                |
| Complexity            | Minimal change (~3 lines moved + 1 condition added)                       | Requires dual-state model; components must merge two data sources     |
| Risk                  | Other code paths that call `setQueryData(['cart'])` could still overwrite | Over-engineering if Approach A already solves the issue               |

**Decision: Approach A first.** If issues persist after deployment, escalate to Approach B.

---

## Post-FIX-1 Discovery: Checkout Boundary Snapshot Loss

After FIX-1 and FIX-1b were in place, another cart-integrity issue was discovered in the LINE checkout flow:

1. The homepage and `/cart` showed the correct items and quantities
2. The shopper started LINE checkout
3. After successful LINE Login, the `/checkout/pending` page showed fewer items than `/cart`

This looked like "the old race condition is back," but it was actually a different boundary problem.

### Why FIX-1 and FIX-1b Were Still Correct

The earlier fixes solved two real problems:

- **FIX-1**: stale PATCH/POST responses should not erase newer pending intent while the user is still interacting with the cart
- **FIX-1b** (`documents/FIX-1/development/race-condition-fix-2.md`): stale full-cart snapshots should not erase already-confirmed optimistic items from the cache

Those fixes protect the **client-side optimistic cart model**.

They do **not**, by themselves, guarantee that the server-side cart snapshot used during checkout matches what the UI currently shows.

### New Root Cause 1: Checkout Used a Server Snapshot, But the UI Could Still Be Ahead

The cart UI can be ahead of the database for up to the debounce window:

- homepage add-to-cart uses optimistic UI
- writes are delayed by 500 ms
- checkout was allowed to start immediately

So the visible cart could contain:

- 3 toast loaves shown optimistically in React Query

while the backend snapshot for pending checkout still contained:

- 0 or 1 toast loaf in the database

That means the pending-order record could be created from stale server state even though FIX-1/FIX-1b kept the browser cache visually correct.

### New Root Cause 2: Pending Snapshot Used Only `sessionId`, Not the Logged-In User's Merged Cart

`/cart` reads through the cart service using:

- current `sessionId`
- plus all sessions linked to the logged-in user

This is why `/cart` can correctly show the merged cart for a signed-in shopper.

But the original pending-order snapshot path used only the current `sessionId`.

Result:

- `/cart` showed the merged cart
- pending checkout snapshot captured only one session's rows
- `/checkout/pending` could therefore show fewer items than `/cart`

This was especially visible for repeat shoppers whose cart data had already been merged across multiple sessions.

### What `race-condition-fix-2.md` Solved, and What It Did Not

`documents/FIX-1/development/race-condition-fix-2.md` remains valid for its original scope:

- out-of-order server responses should not delete already-confirmed optimistic items from the cache
- stale server responses must preserve cache items that are newer

However, it did **not** solve checkout-boundary correctness, because checkout introduces a different requirement:

> Before the app creates an order or a pending-order snapshot, every optimistic cart mutation that the shopper can see must be materialized on the server.

That requirement did not exist in the earlier cart-only analysis.

### Final Mitigation Added After This Discovery

The final solution added two more guarantees on top of FIX-1/FIX-1b:

1. **Flush debounced cart mutations before checkout begins**
   - all registered pending cart timers are forced to complete
   - in-flight requests are awaited
   - the cart query is invalidated afterward so checkout reads the latest committed state

2. **Build pending checkout snapshots with `sessionId + userId`**
   - the backend now captures the same merged cart shape that `/cart` shows to a logged-in shopper

### Updated Mental Model

The final cart consistency model is now:

1. **FIX-1**
   - keep pending intent alive until the API response is reconciled

2. **FIX-1b**
   - preserve optimistic cache state against stale full-cart responses

3. **Checkout-boundary hardening**
   - flush optimistic writes before checkout or pending-order snapshotting
   - snapshot the same merged cart that the shopper sees in `/cart`

All three are needed.

Without step 3, the UI can still be correct while checkout persists stale cart state.

## Remaining Risks / Things Not Yet Solved

The current implementation closes the known checkout regression, but a few boundary conditions still deserve attention:

### 1. Abrupt tab close or browser kill during the debounce window

If the tab is closed before the 500 ms timer fires and before checkout starts, there is still no guarantee the optimistic item ever reaches the backend.

The current system guarantees correctness when the shopper proceeds through app-controlled checkout.
It does not guarantee persistence across unexpected browser termination.

### 2. Any future checkout entrypoint must also flush pending cart mutations

The current protection lives in the checkout flow hook.

If a future feature creates orders from another entrypoint and bypasses that hook, the same class of stale-snapshot bug can reappear.

### 3. Any future debounced cart mutation must register with the global flush registry

The flush mechanism only works for debounced mutations that participate in the shared controller registry.
If a new cart mutation path is added outside that pattern, checkout won't automatically wait for it.
