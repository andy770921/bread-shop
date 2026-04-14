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

## Post-FIX-1c Discovery: Anonymous Session Bootstrap Race

Another regression remained after FIX-1, FIX-1b, and the checkout-boundary flush work:

1. On the homepage, the shopper rapidly adds several different products
2. `/cart` still shows the correct optimistic cart
3. The moment the shopper clicks `LINE 聯繫`, the cart shrinks during the disabled/loading state
4. `/checkout/pending` shows the same smaller subset

Example reported in QA:

- toast x3
- cake x3
- cookie x1
- croissant x1

`/cart` showed all 8 items correctly.
But after clicking checkout, the cart collapsed to only:

- cookie x1
- croissant x1

### Why the Earlier Fixes Did Not Solve This

All previous fixes assumed the cart writes belonged to the **same backend session** and focused on:

- preserving optimistic intent in the browser cache
- preventing stale server responses from overwriting newer cache state
- flushing pending debounced writes before checkout snapshots

Those protections are correct, but they only work **after the browser and backend already agree on which `session_id` owns the cart writes**.

This bug happens one layer earlier: the first burst of cart writes can be split across multiple anonymous sessions before the browser has committed any `session_id` cookie.

### Root Cause: First Product Writes Can Beat Session Cookie Creation

`SessionMiddleware` only creates a session when a cart-related API request reaches the backend.
On the homepage there is no guaranteed blocking "create session first" step before the first add-to-cart burst.

The header does mount `useCart()`, which triggers `GET /api/cart`, but that request is asynchronous.
If the shopper starts clicking products before that response returns and before the browser stores the `Set-Cookie: session_id=...` header, then the first debounced product POSTs are sent **without a cookie**.

Because `useAddToCart()` debounces per `product_id`, the sequence for:

- toast x3
- cake x3
- cookie x1
- croissant x1

becomes four separate backend writes:

- `POST /api/cart/items` for toast quantity 3
- `POST /api/cart/items` for cake quantity 3
- `POST /api/cart/items` for cookie quantity 1
- `POST /api/cart/items` for croissant quantity 1

If those POSTs leave the browser before any one of them has returned a `session_id` cookie, `SessionMiddleware` creates four different anonymous sessions:

- toast -> session A
- cake -> session B
- cookie -> session C
- croissant -> session D

The browser only keeps the cookie from the response that "wins" last.
So the long-term visible backend cart becomes only the items written into that final surviving session.

That explains the reported pattern where `/cart` initially looked correct, but checkout later saw only cookie + croissant.

### Why `/cart` Still Looked Correct Before Checkout

The UI on `/cart` was reading the TanStack Query cache, which had already been updated optimistically on the homepage.

Two details hide the server divergence:

1. homepage `useAddToCart()` immediately updates the cache with all intended items
2. `staleTime: 60s` means navigating to `/cart` does not immediately refetch if that cache entry is still fresh

So `/cart` can display the optimistic cart from memory even though the backend is already fragmented across multiple sessions.

### Why the Cart Shrinks Exactly When Checkout Starts

`useCheckoutFlow()` begins with:

```typescript
await flushPendingCartMutations();
await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart });
```

That invalidation is the first step that forces the UI to read the **real** backend cart again.

At that point:

- the browser now sends only the final surviving `session_id`
- `/api/cart` returns only that session's rows
- the cart page re-renders with the smaller subset
- `POST /api/auth/line/start` snapshots that same reduced server cart into `_cart_snapshot`

So the pending page is not introducing a second bug.
It is faithfully showing the already-truncated cart snapshot.

### Why `flushPendingCartMutations()` Could Not Repair It

The flush logic waits for debounced mutations that are still pending in the current client process.
But once those writes have already been sent and committed into **different anonymous sessions**, flushing cannot merge them back together.

The damage is no longer "pending write not yet persisted."
It is "writes were persisted under different session owners."

### Final Mitigation Added After This Discovery

The missing invariant is:

> Before the first add-to-cart write is sent, the browser must already have a stable cart `session_id`.

The fix adds an explicit cart-session bootstrap on the frontend:

1. start a background `GET /api/cart` bootstrap on the first add-to-cart click
2. before the debounced `POST /api/cart/items` actually sends, await that bootstrap
3. only then send the cart write

Implementation files:

- `frontend/src/queries/cart-session.ts`
- `frontend/src/queries/use-cart.ts`

This prevents the first product burst from being split across multiple anonymous sessions.

### Updated Final Mental Model

The full cart-consistency model now needs four layers:

1. **FIX-1**
   - keep pending intent alive until API reconciliation

2. **FIX-1b**
   - preserve optimistic cache state against stale full-cart snapshots

3. **Checkout-boundary hardening**
   - flush pending debounced writes before checkout snapshots
   - snapshot the merged cart shape used by `/cart`

4. **Anonymous session bootstrap hardening**
   - ensure a stable `session_id` exists before the first add-to-cart POST burst

Without step 4, `/cart` can still look correct in memory while checkout later collapses to the backend subset owned by the last anonymous session.

### New Residual Risk Introduced by Architecture

Any future cart write path that bypasses `useAddToCart()` must preserve the same invariant:

- create or await cart session bootstrap first
- only then send the first anonymous cart write

## Post-FIX-1d Discovery: Dual GET /api/cart Session Split

After all four layers (FIX-1 through FIX-1c) were in place, the exact same symptom returned:

1. Rapidly add products on the homepage: toast ×3, cake ×3, cookie ×1, croissant ×1
2. `/cart` shows all 8 items correctly
3. Click "LINE 聯繫" → during loading wait, items shrink to only cookie ×1, croissant ×1
4. `/checkout/pending` also shows only those 2 items

### Why the FIX-1c Session Bootstrap Did Not Solve This

FIX-1c (`cart-session.ts`) added `ensureCartSessionReady()` which sends a `GET /api/cart` to bootstrap the session before the first `POST /api/cart/items`. This was correct in principle.

But it missed a second, independent `GET /api/cart` that **races** with the bootstrap: the Header component's `useCart()` query.

### Root Cause: Two Independent GET /api/cart Requests Create Two Sessions

On first page load:

1. **Header mounts** → `useCart()` fires `GET /api/cart` (no cookie)
2. **User clicks a product** → `primeCartSessionReady()` fires ANOTHER `GET /api/cart` (also no cookie — Header's response hasn't arrived yet)

Both requests reach `SessionMiddleware` without a `session_id` cookie. Both create **different** anonymous sessions. Both return `Set-Cookie` with different session IDs.

The browser stores the cookie from whichever response arrives **last**. Any `POST /api/cart/items` sent between the two responses uses the **first** cookie, which is later overwritten.

### Detailed Timeline (Matching Reported Symptom)

| Time    | Event                                             | Browser Cookie | Items Written To |
| ------- | ------------------------------------------------- | -------------- | ---------------- |
| t=0     | Header `useCart()` sends `GET /api/cart` (no cookie) | —           | —                |
| t=10ms  | User clicks toast → `primeCartSessionReady()` sends `GET /api/cart` (no cookie) | — | — |
| t=100ms | Bootstrap response arrives → `Set-Cookie: session_id=B` | **B**      | —                |
| t=100ms | `cartSessionReady = true`                         | B              | —                |
| t=200ms | Toast debounce fires → `POST` with cookie B       | B              | toast → **B**    |
| t=300ms | Cake debounce fires → `POST` with cookie B        | B              | cake → **B**     |
| t=350ms | Header `useCart()` response arrives → `Set-Cookie: session_id=A` | **A** (overwritten!) | — |
| t=400ms | Cookie debounce fires → `POST` with cookie A      | A              | cookie → **A**   |
| t=500ms | Croissant debounce fires → `POST` with cookie A   | A              | croissant → **A** |

**Result:**
- Session B: toast, cake
- Session A: cookie, croissant
- Browser cookie: `session_id=A`
- `GET /api/cart` at checkout returns only session A → **cookie ×1, croissant ×1**

### Why `/cart` Still Looked Correct

The TanStack Query cache was updated optimistically on the homepage. With `staleTime: 60s`, navigating to `/cart` does not refetch. The UI shows the optimistic cache (all 8 items).

### Why Items Disappeared Exactly When Checkout Started

`submitCheckout()` calls `queryClient.invalidateQueries({ queryKey: ['cart'] })`, which forces a refetch from the server. The server returns only session A's items. The UI re-renders with the smaller set.

### Why `flushPendingCartMutations()` Could Not Repair It

The flush mechanism waits for pending debounced mutations. But by the time the user clicks "LINE 聯繫", all debounced POSTs have already completed. The items are already split across two sessions. Flushing cannot merge sessions after the fact.

### Fix: Deduplicate the Bootstrap via TanStack Query

The fix replaces the independent `GET /api/cart` in `cart-session.ts` with `queryClient.ensureQueryData()`, which deduplicates with any active `useCart()` fetch:

1. **`cart-session.ts`**: `ensureCartSessionReady(queryClient)` now calls `queryClient.ensureQueryData({ queryKey: ['cart'], ... })` instead of `authedFetchFn('api/cart')` directly. If `useCart()` is already fetching, TanStack Query reuses the in-flight request.

2. **`use-cart.ts`**: `useCart()` now calls `markCartSessionReady()` when its `GET /api/cart` completes (success or error). This signals that the browser has a stable session cookie.

3. **`use-cart.ts`**: `useAddToCart()` passes `queryClient` to `ensureCartSessionReady()` and `primeCartSessionReady()`.

Result: only **one** `GET /api/cart` is ever sent on first load, regardless of timing between Header mount and user clicks. All subsequent POSTs share the same session.

### Updated Final Mental Model

The full cart-consistency model now needs five layers:

1. **FIX-1**
   - keep pending intent alive until API reconciliation

2. **FIX-1b**
   - preserve optimistic cache state against stale full-cart snapshots

3. **Checkout-boundary hardening**
   - flush pending debounced writes before checkout snapshots
   - snapshot the merged cart shape used by `/cart`

4. **Anonymous session bootstrap hardening** (FIX-1c)
   - ensure a stable `session_id` exists before the first add-to-cart POST burst

5. **Bootstrap deduplication** (FIX-1d)
   - deduplicate the bootstrap `GET /api/cart` with the Header's `useCart()` fetch via `queryClient.ensureQueryData()`
   - signal session readiness from `useCart()` via `markCartSessionReady()`

Without step 5, steps 1–4 are correct but the bootstrap GET races with the Header GET, re-creating the multi-session split that step 4 was designed to prevent.

### Remaining Risks

1. **Any new `GET /api/cart` path that bypasses TanStack Query** could re-introduce the dual-session race. All cart reads should go through the `['cart']` query key.

2. **Browser termination before debounce** — same residual risk as before.

3. **New checkout entrypoints** — must still call `flushPendingCartMutations()` first.
