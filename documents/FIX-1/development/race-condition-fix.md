# FIX-1: Implementation — Cart Badge Race Condition Fix

## Approach A: Delay `pending.delete()` (Chosen — Implement Now)

### Principle

Don't remove an item's pending entry until **after** the API response has been processed and reconciled. Only delete if the user hasn't changed their intent during the request (i.e., `sentQty === currentPendingQty`).

### Changes to `useUpdateCartItem`

**Before (buggy):**

```typescript
p.timer = setTimeout(async () => {
  const qty = p.quantity;
  pending.delete(itemId); // ← deleted BEFORE API call

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

| Time     | Event                                                | `pending` Map                        | Header           |
| -------- | ---------------------------------------------------- | ------------------------------------ | ---------------- |
| t=0      | Click + on A                                         | `{A: {qty:4}}`                       | **6**            |
| t=100ms  | Click + on B                                         | `{A: {qty:4}, B: {qty:3}}`           | **7**            |
| t=500ms  | Timer A fires, PATCH A sent                          | `{A: {qty:4}, B: {qty:3}}` (A kept!) | **7**            |
| t=600ms  | Timer B fires, PATCH B sent                          | `{A: {qty:4}, B: {qty:3}}` (B kept!) | **7**            |
| t=~800ms | PATCH A response {A:4, B:2}                          |                                      |                  |
|          | `sentQty(4) === pending.get(A).qty(4)` → delete A    | `{B: {qty:3}}`                       |                  |
|          | `applyPendingUpdates({A:4,B:2}, {B:3})` → {A:4, B:3} |                                      | **7** (no drop!) |
| t=~900ms | PATCH B response {A:4, B:3}                          |                                      |                  |
|          | `sentQty(3) === pending.get(B).qty(3)` → delete B    | `{}`                                 |                  |
|          | `applyPendingUpdates({A:4,B:3}, {})` → {A:4, B:3}    |                                      | **7**            |

### Edge Case: User Clicks Again During API Call

1. Timer fires for item A with `sentQty=4`, PATCH sent
2. User clicks + on A → `pending.get(A).qty = 5`, new timer starts
3. PATCH A response arrives: `sentQty(4) !== pending.get(A).qty(5)` → **don't delete**
4. `applyPendingUpdates(server{A:4}, {A:{qty:5}})` → A=5 (user intent preserved)
5. New timer fires → PATCH with qty=5
6. Response: `sentQty(5) === pending.get(A).qty(5)` → delete, converged

### Files Changed

| File                               | Change                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
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
  intentRef.current.delete(itemId); // Converged — clear intent
  queryClient.setQueryData(['cart'], serverCart); // Trust server
} else {
  // User clicked again during request — re-send
  debouncedPatch(itemId, intentRef.current.get(itemId));
}
```

### Key Differences from Approach A

| Aspect                                 | Approach A                                                            | Approach B                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Display source                         | TanStack Query cache (updated optimistically)                         | Intent store with cache fallback                                                                           |
| Vulnerability to external cache writes | Possible: other code calling `setQueryData(['cart'])` could overwrite | Immune: display reads from intent store, not cache                                                         |
| Implementation scope                   | 2 hooks modified (~6 lines each)                                      | Hooks + components modified; display logic changes                                                         |
| Convergence                            | Implicit via debounce + pending Map                                   | Explicit loop: compare → re-send → compare                                                                 |
| When to use                            | First-line fix; sufficient for the identified multi-item race         | If Approach A still shows drops due to other cache writers (e.g., `invalidateQueries`, auth context, etc.) |

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

---

## Post-FIX-1b Hardening: Checkout Boundary Flush + Merged Snapshot

After the earlier cart-race fixes were deployed, a new regression was found in the LINE checkout flow:

- the shopper could see the correct cart on `/cart`
- but after LINE Login, `/checkout/pending` could show fewer items

This was not a contradiction of FIX-1/FIX-1b.
It exposed a different implementation boundary: **checkout correctness requires the server-side snapshot to catch up with the optimistic UI before redirecting or creating the pending order.**

### What `race-condition-fix-2.md` Already Fixed

`documents/FIX-1/development/race-condition-fix-2.md` fixed the stale-response overwrite problem inside the optimistic cart cache:

- stale full-cart responses should not remove newer optimistic items
- confirmed items should survive out-of-order server snapshots
- the UI cache should converge without silently dropping products

That remains valid and is still part of the final system.

### What Was Still Missing

Two gaps remained:

#### 1. Checkout could begin while debounced cart writes were still pending

The cart UI used optimistic updates plus a 500 ms debounce.
That meant a shopper could:

1. rapidly add the same product multiple times on the homepage
2. see the correct quantity in the UI
3. immediately enter checkout

At that moment, the backend could still be behind the UI.

So the pending-order snapshot could be created from stale database state, even though the optimistic cache was correct.

#### 2. Pending LINE snapshots originally used only the current `sessionId`

For signed-in users, `/cart` reads a merged cart across:

- current `sessionId`
- all sessions linked to the authenticated user

But the original pending-order snapshot path only used the current `sessionId`.

So a signed-in user could see the merged cart on `/cart`, while the pending-order snapshot captured only one session's rows.

### Final Implementation Added

#### A. Global flush support for debounced cart mutations

The debounced mutation infrastructure now exposes:

- `flushPendingCartMutations()`

Implementation details:

- every debounced cart hook registers a controller in a module-level registry
- each controller can flush its pending timers immediately
- if a request is already in flight for the same quantity, flush waits for it
- after flush, checkout invalidates the cart query so the next read comes from committed server state

Current implementation file:

- `frontend/src/queries/use-debounced-cart-mutation.ts`

This is broader than the original FIX-1 implementation, which lived conceptually inside `use-cart.ts`.
The final code now centralizes the behavior in the generic debounced-mutation hook.

#### B. Checkout now flushes before doing anything else

The checkout flow now starts with:

```typescript
await flushPendingCartMutations();
await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart });
```

Current implementation file:

- `frontend/src/features/checkout/use-checkout-flow.ts`

This applies to:

- LINE checkout
- credit-card checkout

So the fix is not LINE-specific.
It protects any order path that depends on cart correctness.

#### C. Pending LINE checkout snapshots now use merged cart semantics

The backend now reads the cart snapshot with:

- `sessionId`
- plus `userId` when the shopper is already authenticated

Current implementation files:

- `backend/src/order/order.service.ts`
- `backend/src/auth/auth.controller.ts`

That makes the pending-order snapshot match the same merged cart model used by `/cart`.

#### D. Add-to-cart now bootstraps a stable session before the first write burst

The remaining regression showed that the previous layers were still not enough for the
very first anonymous add-to-cart burst.

Problem:

- homepage `Header` mounts `useCart()` and starts `GET /api/cart`
- but that request is asynchronous
- a fast shopper can still click products before the browser has stored the `session_id` cookie
- `useAddToCart()` debounces by `product_id`, so several different product POSTs can leave the browser without any cookie
- `SessionMiddleware` then creates a different anonymous session for each POST

At that point the browser cache can still look correct, but checkout later invalidates the cart query and reveals only the rows from the final surviving session cookie.

The implementation fix adds an explicit session bootstrap helper:

- `frontend/src/queries/cart-session.ts`

Core behavior:

1. `primeCartSessionReady()` starts a background `GET /api/cart` on the first add click
2. `ensureCartSessionReady()` deduplicates concurrent callers and waits for that request
3. `useAddToCart()` awaits `ensureCartSessionReady()` before sending `POST /api/cart/items`

Current code shape:

```typescript
// frontend/src/queries/cart-session.ts
let cartSessionReady = false;
let cartSessionPromise: Promise<void> | null = null;

export async function ensureCartSessionReady(): Promise<void> {
  if (cartSessionReady) return;

  if (!cartSessionPromise) {
    cartSessionPromise = authedFetchFn('api/cart').then(() => {
      cartSessionReady = true;
    });
  }

  await cartSessionPromise;
}

export function primeCartSessionReady(): void {
  if (!cartSessionReady && !cartSessionPromise) {
    void ensureCartSessionReady().catch(() => undefined);
  }
}
```

```typescript
// frontend/src/queries/use-cart.ts
const addToCart = useCallback((productId: number, productPrice: number) => {
  primeCartSessionReady();
  run({ productId, productPrice });
}, [run]);

send: async (productId, quantity) => {
  await ensureCartSessionReady();
  return authedFetchFn<CartResponse>('api/cart/items', {
    method: 'POST',
    body: { product_id: productId, quantity },
  });
},
```

Why this works:

- the optimistic UI can still update immediately
- the first anonymous cart write is delayed just enough to guarantee that the browser already owns a stable `session_id`
- all per-product debounced POSTs then share the same backend session
- checkout invalidation now sees the same cart that the shopper saw on `/cart`

### Final Outcome

The full protection is now layered:

1. **FIX-1**
   - do not delete pending intent before reconciliation

2. **FIX-1b**
   - do not let stale full-cart responses erase newer optimistic cache state

3. **Checkout-boundary hardening**
   - flush pending debounced writes before checkout
   - build pending snapshots from the merged cart visible to the shopper

4. **Anonymous session bootstrap hardening**
   - bootstrap `session_id` before the first add-to-cart POST burst

### Additional Files Changed in the Final Form

| File                                                  | Role in the final solution                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `frontend/src/queries/use-debounced-cart-mutation.ts` | Adds the shared flush registry and flush execution path           |
| `frontend/src/features/checkout/use-checkout-flow.ts` | Flushes and refreshes cart state before any checkout path         |
| `backend/src/order/order.service.ts`                  | Supports reading cart snapshot with optional `userId`             |
| `backend/src/auth/auth.controller.ts`                 | Builds pending LINE checkout snapshots with merged cart semantics |
| `frontend/src/queries/cart-session.ts`                | Ensures the browser has a stable cart session before first write  |
| `frontend/src/queries/use-cart.ts`                    | Primes and awaits the cart-session bootstrap in add-to-cart flow  |

### Residual Risks

The current implementation covers the known regression, but a few limitations remain:

#### 1. Browser termination before flush

If the shopper closes the tab or the app process is killed before the debounce fires, the optimistic item may still never reach the server.

#### 2. New checkout entrypoints must reuse the flush step

Any future order flow that bypasses `useCheckoutFlow()` must explicitly flush pending cart mutations first.

#### 3. New debounced cart hooks must participate in the shared registry

If a future cart mutation path uses debounce but does not register in the shared flush mechanism, checkout can again snapshot stale state.

#### 4. New anonymous cart write paths must also bootstrap the session first

If a future feature writes to the cart outside `useAddToCart()` and does not await the session bootstrap, the same multi-session split can return.

---

## FIX-1d: Bootstrap Deduplication — Dual GET /api/cart Session Split

### Problem

After FIX-1c, the session bootstrap (`primeCartSessionReady()`) sent its own `GET /api/cart` via `authedFetchFn` — completely independent of the Header component's `useCart()` query. On first page load, both requests could reach the backend without a `session_id` cookie, each creating a different anonymous session.

The `Set-Cookie` from the later response overwrites the earlier one. Any `POST /api/cart/items` that was sent between the two responses goes to the first (now-overwritten) session. This splits cart items across two sessions, with the browser's final cookie pointing to only one.

### Symptom

Identical to FIX-1c: `/cart` shows all items (optimistic cache), but clicking "LINE 聯繫" triggers `invalidateQueries`, which refetches from the server and reveals only the items belonging to the surviving session.

The items that disappear are the ones whose debounced POSTs fired between the bootstrap response and the Header response (i.e., before the cookie flip). The items that survive are the ones whose POSTs fired after the cookie was overwritten.

### Implementation

#### A. `cart-session.ts` — replace direct fetch with `queryClient.ensureQueryData()`

**Before (FIX-1c):**

```typescript
let cartSessionReady = false;
let cartSessionPromise: Promise<void> | null = null;

async function bootstrapCartSession(): Promise<void> {
  await authedFetchFn('api/cart');
  cartSessionReady = true;
}

export async function ensureCartSessionReady(): Promise<void> {
  if (cartSessionReady) return;
  if (!cartSessionPromise) {
    cartSessionPromise = bootstrapCartSession().catch((error) => {
      cartSessionPromise = null;
      throw error;
    });
  }
  await cartSessionPromise;
}

export function primeCartSessionReady(): void {
  if (cartSessionReady || cartSessionPromise) return;
  void ensureCartSessionReady().catch(() => undefined);
}
```

**After (FIX-1d):**

```typescript
let cartSessionReady = false;

export function markCartSessionReady(): void {
  cartSessionReady = true;
}

export async function ensureCartSessionReady(queryClient: QueryClient): Promise<void> {
  if (cartSessionReady) return;

  // Reuse the ['cart'] query — TanStack Query deduplicates with any active useCart() fetch.
  await queryClient.ensureQueryData<CartResponse>({
    queryKey: QUERY_KEYS.cart,
    queryFn: async () => {
      try {
        return await authedFetchFn<CartResponse>('api/cart');
      } catch {
        return EMPTY_CART;
      }
    },
  });
  cartSessionReady = true;
}

export function primeCartSessionReady(queryClient: QueryClient): void {
  if (cartSessionReady) return;
  void ensureCartSessionReady(queryClient).catch(() => undefined);
}
```

Key change: `queryClient.ensureQueryData()` checks for an in-flight `['cart']` query. If `useCart()` is already fetching, TanStack Query returns the same promise — no second request is sent.

#### B. `use-cart.ts` — mark session ready from useCart, pass queryClient to bootstrap

```typescript
// useCart() — mark session ready after any GET /api/cart completes
export function useCart() {
  return useQuery<CartResponse>({
    queryKey: QUERY_KEYS.cart,
    queryFn: async () => {
      try {
        const data = await authedFetchFn<CartResponse>('api/cart');
        markCartSessionReady();
        return data;
      } catch {
        markCartSessionReady();
        return EMPTY_CART;
      }
    },
  });
}

// useAddToCart() — pass queryClient to session bootstrap
export function useAddToCart(options?: { onError?: () => void }) {
  const queryClient = useQueryClient();

  const { run } = useDebouncedCartMutation<...>({
    // ...
    send: async (productId, quantity) => {
      await ensureCartSessionReady(queryClient);
      return authedFetchFn<CartResponse>('api/cart/items', { ... });
    },
  });

  const addToCart = useCallback(
    (productId: number, productPrice: number) => {
      primeCartSessionReady(queryClient);
      run({ productId, productPrice });
    },
    [queryClient, run],
  );
  // ...
}
```

### Why This Works

| Time    | Event                                                | Network Requests |
| ------- | ---------------------------------------------------- | ---------------- |
| t=0     | Header mounts → `useCart()` starts fetch             | `GET /api/cart` (1 request) |
| t=10ms  | User clicks product → `primeCartSessionReady(qc)`   | — (reuses in-flight query via `ensureQueryData`) |
| t=100ms | Fetch completes → session A created, cookie set      | — |
| t=100ms | `markCartSessionReady()` called from `useCart()` queryFn | — |
| t=100ms | `ensureCartSessionReady` also resolves (same promise) → `cartSessionReady = true` | — |
| t=200ms | Toast POST → cookie A → toast in session A           | `POST /api/cart/items` |
| t=300ms | Cake POST → cookie A → cake in session A             | `POST /api/cart/items` |
| t=400ms | Cookie POST → cookie A → cookie in session A         | `POST /api/cart/items` |
| t=500ms | Croissant POST → cookie A → croissant in session A   | `POST /api/cart/items` |

Only **one** `GET /api/cart` is sent. All items go to session A.

### Files Changed

| File                                         | Change                                                    |
| -------------------------------------------- | --------------------------------------------------------- |
| `frontend/src/queries/cart-session.ts`       | Replace direct `authedFetchFn` with `queryClient.ensureQueryData()`, add `markCartSessionReady()` |
| `frontend/src/queries/use-cart.ts`           | Call `markCartSessionReady()` in `useCart()`, pass `queryClient` to bootstrap in `useAddToCart()` |
| `frontend/src/queries/cart-session.spec.ts`  | Update tests for new API (queryClient parameter, markCartSessionReady) |

### Updated Residual Risks

#### 1. Any new `GET /api/cart` path that bypasses TanStack Query

If a future feature sends `GET /api/cart` via `authedFetchFn` directly (not through the `['cart']` query), it could create a second session. All cart reads should use the `['cart']` query key.

#### 2–4. Same as before

Browser termination, new checkout entrypoints, and new debounced mutation paths carry the same risks documented in FIX-1c.

---

## FIX-1e: Replace Query-Cache Readiness with a Shared Real Bootstrap Request

After re-testing the reported flow, FIX-1d turned out to be necessary but not sufficient.

The failure pattern was:

1. homepage optimistic cart looked correct
2. `/cart` still looked correct
3. clicking `LINE 聯繫` caused the `/cart` summary itself to shrink during loading
4. `/checkout/pending` showed the same smaller subset

That meant checkout was not inventing a new bug.
It was exposing that the server cart still lagged behind the optimistic client cart.

### Why FIX-1d Was Still Too Weak

The FIX-1d version used:

```typescript
await queryClient.ensureQueryData({ queryKey: QUERY_KEYS.cart, ... });
```

as the session-readiness gate.

That was still the wrong boundary.
`ensureQueryData()` proves the query has data.
It does **not** prove that one successful `GET /api/cart` response has already completed and established the browser's `session_id` cookie.

For this bug, that distinction is critical.

### Final Implementation

#### A. `frontend/src/queries/cart-session.ts` — own one real bootstrap promise

**Before (FIX-1d):**

```typescript
let cartSessionReady = false;
let cartSessionPromise: Promise<void> | null = null;

export async function ensureCartSessionReady(queryClient: QueryClient): Promise<void> {
  if (cartSessionReady) return;

  if (!cartSessionPromise) {
    cartSessionPromise = queryClient
      .ensureQueryData<CartResponse>({
        queryKey: QUERY_KEYS.cart,
        queryFn: async () => {
          try {
            return await authedFetchFn<CartResponse>('api/cart');
          } catch {
            return EMPTY_CART;
          }
        },
      })
      .then(() => {
        cartSessionReady = true;
      })
      .catch(() => {
        cartSessionPromise = null;
      });
  }

  await cartSessionPromise;
}
```

**After (FIX-1e):**

```typescript
let cartSessionReady = false;
let cartSessionPromise: Promise<CartResponse> | null = null;

async function bootstrapCartSession(): Promise<CartResponse> {
  if (!cartSessionPromise) {
    cartSessionPromise = authedFetchFn<CartResponse>('api/cart')
      .then((data) => {
        cartSessionReady = true;
        return data;
      })
      .catch((error) => {
        cartSessionPromise = null;
        throw error;
      });
  }

  return cartSessionPromise;
}

export async function fetchCart(): Promise<CartResponse> {
  try {
    if (!cartSessionReady) {
      return await bootstrapCartSession();
    }

    return await authedFetchFn<CartResponse>('api/cart');
  } catch {
    return EMPTY_CART;
  }
}

export async function ensureCartSessionReady(): Promise<void> {
  if (cartSessionReady) return;
  await bootstrapCartSession();
}

export function primeCartSessionReady(): void {
  if (cartSessionReady || cartSessionPromise) return;
  void bootstrapCartSession().catch(() => undefined);
}
```

Key change:

- session readiness is now tied to a **real shared `GET /api/cart` network promise**
- failure no longer silently marks the session as ready
- later reads still fetch normally after bootstrap is done

#### B. `frontend/src/queries/use-cart.ts` — reuse the shared bootstrap from both read and write paths

**Before (FIX-1d):**

```typescript
export function useCart() {
  return useQuery<CartResponse>({
    queryKey: QUERY_KEYS.cart,
    queryFn: async () => {
      try {
        const data = await authedFetchFn<CartResponse>('api/cart');
        markCartSessionReady();
        return data;
      } catch {
        markCartSessionReady();
        return EMPTY_CART;
      }
    },
  });
}

send: async (productId, quantity) => {
  await ensureCartSessionReady(queryClient);
  return authedFetchFn<CartResponse>('api/cart/items', { ... });
},

const addToCart = useCallback((productId, productPrice) => {
  primeCartSessionReady(queryClient);
  run({ productId, productPrice });
}, [queryClient, run]);
```

**After (FIX-1e):**

```typescript
export function useCart() {
  return useQuery<CartResponse>({
    queryKey: QUERY_KEYS.cart,
    queryFn: fetchCart,
  });
}

send: async (productId, quantity) => {
  await ensureCartSessionReady();
  return authedFetchFn<CartResponse>('api/cart/items', { ... });
},

const addToCart = useCallback((productId, productPrice) => {
  primeCartSessionReady();
  run({ productId, productPrice });
}, [run]);
```

This makes `useCart()` and add-to-cart share the same bootstrap boundary instead of relying on React Query cache state.

### Why This Fix Matches the Reported Symptom

With the old FIX-1d implementation, checkout could still reach this state:

- React Query cache contained all optimistic items
- checkout invalidation forced a server refetch
- the server returned only the items tied to the surviving anonymous session
- `/cart` summary shrank during CTA loading
- pending-order snapshot copied that smaller server cart

With FIX-1e:

- add-to-cart POSTs cannot proceed until one real `GET /api/cart` bootstrap response completes
- all later anonymous POSTs share the same stable cookie boundary
- checkout invalidation and pending-order snapshot now read the same cart the shopper saw

### Tests Updated

`frontend/src/queries/cart-session.spec.ts` now verifies:

1. `fetchCart()` and `ensureCartSessionReady()` share one real bootstrap request
2. `primeCartSessionReady()` only starts that bootstrap once
3. later `fetchCart()` calls perform normal fresh network reads after bootstrap
4. bootstrap failures do **not** mark the session as ready

### Files Changed by FIX-1e

| File                                        | Change |
| ------------------------------------------- | ------ |
| `frontend/src/queries/cart-session.ts`      | Replace `ensureQueryData()` readiness with a shared real `GET /api/cart` bootstrap promise |
| `frontend/src/queries/use-cart.ts`          | Route `useCart()` through `fetchCart()` and remove `queryClient` dependency from cart-session bootstrap |
| `frontend/src/queries/cart-session.spec.ts` | Update tests to cover shared bootstrap, retry-after-failure, and post-bootstrap fresh reads |
