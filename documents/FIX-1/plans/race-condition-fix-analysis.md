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

| Time | Event | `pending` Map | Cache `item_count` | Header |
|------|-------|---------------|--------------------|--------|
| t=0 | Click + on A → optimistic update | `{A: {qty:4}}` | 6 | **6** |
| t=100ms | Click + on B → optimistic update | `{A: {qty:4}, B: {qty:3}}` | 7 | **7** |
| t=500ms | Timer A fires → `pending.delete(A)`, PATCH A sent | `{B: {qty:3}}` | 7 | **7** |
| t=600ms | Timer B fires → `pending.delete(B)`, PATCH B sent | `{}` **(empty!)** | 7 | **7** |
| t=~800ms | PATCH A response arrives: server returns `{A:4, B:2}` | `{}` | — | — |
| | `applyPendingUpdates(server, empty_pending)` → uses server as-is | | **6** | **6 (DROPPED!)** |
| t=~900ms | PATCH B response arrives: server returns `{A:4, B:3}` | `{}` | — | — |
| | `applyPendingUpdates(server, empty_pending)` → uses server as-is | | **7** | **7 (restored)** |

**The header badge path: 5 → 6 → 7 → 6 → 7.** The drop from 7 to 6 is caused by PATCH A's response arriving before PATCH B's response. The server's response for A doesn't include B's update yet (B's PATCH is still in-flight), and the reconciliation can't overlay B's intent because B was already deleted from pending.

### Why It Doesn't Always Happen

The bug requires:
1. **Two or more different items** being updated in a close time window (same item updates are collapsed by the debounce, so only one PATCH fires)
2. **The PATCH responses arriving in order** where an earlier response doesn't reflect a later item's update (normal behavior since each PATCH only modifies one item)

If the user only clicks + on a single item, the debounce correctly collapses all clicks into one PATCH — no race. The bug is specific to **multiple items with overlapping in-flight PATCH requests**.

### Same Bug in `useAddToCart`

`useAddToCart` has the identical pattern at line 150:

```typescript
pending.delete(productId);   // BEFORE API call
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

| | A: Delay pending.delete | B: Separate local state |
|---|---|---|
| Core idea | Keep entry in existing `pending` Map until API confirms | Maintain a separate intent store; only clear on server match |
| Convergence mechanism | Implicit: debounce timer fires with latest pending value | Explicit: compare server response to local state, re-send if mismatch |
| Robustness | Handles multi-item races; still uses TanStack cache for display | More defensive: immune to any external cache overwrite |
| Complexity | Minimal change (~3 lines moved + 1 condition added) | Requires dual-state model; components must merge two data sources |
| Risk | Other code paths that call `setQueryData(['cart'])` could still overwrite | Over-engineering if Approach A already solves the issue |

**Decision: Approach A first.** If issues persist after deployment, escalate to Approach B.
