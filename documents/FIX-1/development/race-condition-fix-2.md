# FIX-1b: Out-of-Order Response Race — Items Silently Dropped from Cart

## Symptom

A user adds 5 different products from the homepage. 4 appear in the cart; 1 (toast) silently disappears. No error toast is shown — the item is optimistically added, then vanishes when a later API response overwrites the cache.

---

## Root Cause: `reconcileWithPending` Drops Confirmed Items on Stale Responses

### Background

When the user clicks "Add to Cart" on 5 different products in quick succession, the `useAddToCart` hook:

1. Immediately updates the TanStack Query cache (optimistic UI).
2. Accumulates a per-product delta in a `pending` Map (keyed by `product_id`).
3. After a 500 ms debounce per product, sends `POST /api/cart/items { product_id, quantity }`.
4. On response, removes the product from `pending` (if `sentQty` still matches) and calls `reconcileWithPending(serverCart, pending, currentCache)` to merge the server snapshot with remaining pending intent.

Each POST calls the backend `addItem` → `upsert_cart_item` RPC → `getCart(sessionId)`. The response is a **full cart snapshot at the moment `getCart` runs on the server**.

### The Race

5 concurrent POST requests execute on the server roughly in parallel. Each `getCart` reflects the DB state at its execution time — **not** the state after all 5 upserts commit:

| POST | Server-side `getCart` snapshot |
|------|-------------------------------|
| A (executes first) | `{A}` |
| B | `{A, B}` |
| C | `{A, B, C}` |
| D | `{A, B, C, D}` |
| E (executes last) | `{A, B, C, D, E}` |

Responses arrive at the frontend **in any order**. Suppose they arrive: **E, D, C, B, A** (reverse of server execution).

| Step | Response | `pending` after delete | Cache set to |
|------|----------|----------------------|-------------|
| 1 | POST E → `{A,B,C,D,E}` | `{A,B,C,D}` (E deleted) | `{A,B,C,D,E}` (A–D from cache, E from server) |
| 2 | POST D → `{A,B,C,D}` | `{A,B,C}` (D deleted) | `{A,B,C,D,E}` (A–C from cache, D from server, E from cache) |
| 3 | POST C → `{A,B,C}` | `{A,B}` (C deleted) | `{A,B,C,D,E}` (similar merge) |
| 4 | POST B → `{A,B}` | `{A}` (B deleted) | `{A,B,C,D,E}` (A from cache, B from server, C–E from cache) |
| 5 | POST A → `{A}` | `{}` (A deleted) | **`{A}` — items B,C,D,E LOST** |

### Why Step 5 Loses Items

The old `reconcileWithPending` had two flaws:

**Flaw 1 — Early return on empty pending:**

```typescript
if (pending.size === 0) return serverCart;
```

When the last response arrives (POST A, the stalest snapshot `{A}`), `pending` is already empty — all products were confirmed by earlier-received responses. The function short-circuits and returns the stale server snapshot directly. Items B–E vanish.

**Flaw 2 — Only pending items preserved from cache:**

Even without the early return, the old code only iterated `pending` keys when preserving cache items:

```typescript
for (const [productId] of pending) {          // only pending keys
  if (!serverProductIds.has(productId)) {
    const optimisticItem = optimisticCache.items.find(...);
    if (optimisticItem) items.push(optimisticItem);
  }
}
```

Items that were **confirmed** (deleted from `pending`) but absent from the stale server response had no path to survive.

### Secondary Bug — Double-Counting Pending Deltas

When POST C's response includes product A (the server already applied A's upsert before C's `getCart`), the old code added A's pending delta *again*:

```typescript
const newQty = Math.min(item.quantity + p.quantity, 99);  // server_qty + delta
```

If server already has `A: qty=1` and pending delta is `1`, this yields `2` — double the correct value. The inflation self-corrects when A's own response arrives, but the transient wrong quantity is a UI glitch.

---

## Fix

### Changes to `reconcileWithPending` in `frontend/src/queries/use-cart.ts`

Two structural changes:

#### 1. Remove early return; preserve ALL cache items not in server response

```typescript
// BEFORE (bug): only preserve items whose product_id is still in pending
if (optimisticCache) {
  for (const [productId] of pending) {
    if (!serverProductIds.has(productId)) {
      const optimisticItem = optimisticCache.items.find((i) => i.product_id === productId);
      if (optimisticItem) items.push(optimisticItem);
    }
  }
}

// AFTER (fix): preserve ALL cache items absent from server response
if (optimisticCache) {
  for (const item of optimisticCache.items) {
    if (!serverProductIds.has(item.product_id)) {
      items.push(item);
    }
  }
}
```

This ensures items confirmed by earlier-received responses survive when a stale later-received response omits them.

#### 2. Use optimistic cache value for still-pending items (no double-counting)

```typescript
// BEFORE (bug): add pending delta to server qty (may double-count)
const items = serverCart.items.map((item) => {
  const p = pending.get(item.product_id);
  if (p) {
    const newQty = Math.min(item.quantity + p.quantity, 99);
    return { ...item, quantity: newQty, line_total: newQty * item.product.price };
  }
  return item;
});

// AFTER (fix): for still-pending items, prefer the optimistic cache value
const items = serverCart.items.map((item) => {
  if (pending.has(item.product_id) && optimisticCache) {
    const cacheItem = optimisticCache.items.find((i) => i.product_id === item.product_id);
    if (cacheItem) return cacheItem;
  }
  return item;
});
```

The optimistic cache already reflects the user's intended quantity (original + delta). Using it directly avoids the ambiguity of whether the server's quantity already includes the delta.

---

## Walkthrough — 5 Products, Responses Arrive in Reverse Order

Products A–E, all new (cart initially empty). Responses arrive: E, D, C, B, A.

| Step | Response (server snapshot) | `pending` after | Cache after reconciliation |
|------|---------------------------|-----------------|---------------------------|
| 0 | — (optimistic updates) | `{A:1,B:1,C:1,D:1,E:1}` | `{A:1,B:1,C:1,D:1,E:1}` |
| 1 | POST E → `{A,B,C,D,E}` | `{A,B,C,D}` | A,B,C,D from cache; E from server → `{A:1,B:1,C:1,D:1,E:1}` |
| 2 | POST D → `{A,B,C,D}` | `{A,B,C}` | A,B,C from cache; D from server; E from cache → `{A:1,B:1,C:1,D:1,E:1}` |
| 3 | POST C → `{A,B,C}` | `{A,B}` | A,B from cache; C from server; D,E from cache → `{A:1,B:1,C:1,D:1,E:1}` |
| 4 | POST B → `{A,B}` | `{A}` | A from cache; B from server; C,D,E from cache → `{A:1,B:1,C:1,D:1,E:1}` |
| 5 | POST A → `{A}` | `{}` | A from server; **B,C,D,E from cache** → `{A:1,B:1,C:1,D:1,E:1}` |

All 5 items preserved at every step. No double-counting.

---

## Why `useUpdateCartItem` (Cart Page +/- Buttons) Is Not Affected

`useUpdateCartItem` uses `applyPendingUpdates` which:
- Keys by `item.id` (cart_item_id), not `product_id`
- Stores **target quantity** (not delta) — `entry.quantity = newQuantity`
- PATCH only modifies existing items; `getCart` always includes all items

Out-of-order PATCH responses may show stale quantities for other items, but `applyPendingUpdates` overlays the correct pending target for items still awaiting confirmation. Items are never absent from the response because they already exist in the DB.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/queries/use-cart.ts` | Rewrote `reconcileWithPending`: removed early return on empty pending; preserve all cache items (not just pending); use cache value for still-pending items instead of `server_qty + delta` |
