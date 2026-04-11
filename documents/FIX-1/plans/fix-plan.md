# FIX-1: Fix Plan — Rapid Add-to-Cart

## Strategy

Fix at **two layers**: make the backend atomic (eliminate the race), and make the
frontend smarter (reduce unnecessary concurrent requests).

---

## Layer 1: Backend — Atomic Upsert (eliminates root causes #1 and #4)

### Option A: PostgreSQL RPC Function with UPSERT (Recommended)

Create a Supabase database function `upsert_cart_item(p_session_id, p_product_id, p_quantity)`
that uses a single SQL statement:

```sql
INSERT INTO cart_items (session_id, product_id, quantity)
VALUES (p_session_id, p_product_id, p_quantity)
ON CONFLICT (session_id, product_id)
DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 99),
              updated_at = now()
RETURNING *;
```

**Requires**: a UNIQUE constraint on `(session_id, product_id)`.

**Pros**: Single atomic SQL statement, zero race window, simplest code change,
fastest execution (1 query instead of 3-4).
**Cons**: Requires a Supabase migration (add constraint + function).

### Option B: Application-Level Mutex per Session+Product

Use an in-memory lock (e.g., `Map<string, Promise>`) keyed by
`${sessionId}:${productId}`. Each addItem call waits for any in-flight call
with the same key to finish before proceeding.

**Pros**: No database migration needed.
**Cons**: Only works for single-server deployments (Vercel serverless = multiple
instances). Adds complexity. Still 3-4 queries per call.

### Option C: Optimistic Locking with Version Field

Add a `version` column to `cart_items`. SELECT returns version, UPDATE includes
`WHERE version = ?`. On conflict, retry.

**Pros**: Works across multiple servers.
**Cons**: Requires migration, adds retry logic, still multiple round-trips,
retries add latency.

**Decision needed: A, B, or C?**
Recommendation: **Option A** — it's the most robust, simplest to implement, and
also delivers the best performance improvement (1 query vs 3-4).

---

## Layer 2: Frontend — Reduce Concurrent Requests (mitigates root cause #3)

### Option A: Debounce + Accumulate

Accumulate rapid clicks into a single mutation. When user clicks "add to cart",
start a short timer (e.g., 300ms). Each subsequent click increments a local
counter. When the timer fires, send **one** request with `quantity = N`.

| | Detail |
|---|---|
| **Perceived latency** | 300ms (UI doesn't update until timer fires and request completes) |
| **Network requests** | 1 per burst |
| **Implementation complexity** | Low — debounce timer + counter |
| **Pros** | Minimal network traffic; eliminates concurrent requests entirely |
| **Cons** | 300ms perceived delay feels sluggish; user gets no visual feedback until API responds; if debounce window is too short, burst may split into 2 requests |

### Option B: Serial Queue (Mutation Scope Key)

Use TanStack Query's built-in `mutationKey` + `scope` to serialize mutations:
all addToCart mutations run one after another, never concurrently.

| | Detail |
|---|---|
| **Perceived latency** | 0ms per click (fires immediately), but total completion = N x round-trip |
| **Network requests** | N (one per click) |
| **Implementation complexity** | Low — add `scope` to mutation config |
| **Pros** | No delay per click; each click fires immediately (just waits in queue); no race condition since requests are serial |
| **Cons** | Still sends N requests for N clicks (more network + DB load); slower total completion; cart count in header updates stepwise (1→2→3→4→5) which looks janky |

### Option C: Disable Button While Pending

Set `disabled={addToCart.isPending}` on the add-to-cart button.

| | Detail |
|---|---|
| **Perceived latency** | 0ms for first click; subsequent clicks blocked until response |
| **Network requests** | 1 at a time (user physically can't click fast enough) |
| **Implementation complexity** | Trivial — one prop change |
| **Pros** | Simplest change; zero race condition |
| **Cons** | Bad UX — button flickers enabled/disabled; user can't express intent to add multiple; feels broken; on fast connections 1 concurrent request can still slip through before `isPending` updates |

### Option D: Optimistic UI Update + Debounced API Call (Recommended)

On each click, **immediately** update the TanStack Query cache (optimistic update)
to reflect the new quantity. Start/reset a debounce timer (500ms–1000ms). When
the timer fires with no further clicks, send **one** API request with the
accumulated `quantity = N`. If the API call fails, roll back the cache to the
server's last known state.

```
Click 1 (t=0ms)    → UI: cart count 1 (instant)  | timer starts (500ms)
Click 2 (t=100ms)  → UI: cart count 2 (instant)  | timer resets (500ms)
Click 3 (t=200ms)  → UI: cart count 3 (instant)  | timer resets (500ms)
Click 4 (t=250ms)  → UI: cart count 4 (instant)  | timer resets (500ms)
Click 5 (t=400ms)  → UI: cart count 5 (instant)  | timer resets (500ms)
t=900ms             → API: POST /api/cart/items { product_id, quantity: 5 }
API response        → cache reconciled with server response
```

| | Detail |
|---|---|
| **Perceived latency** | **0ms** — UI updates instantly on every click |
| **Network requests** | **1 per burst** (same as Option A) |
| **Implementation complexity** | Medium — optimistic cache update + debounce timer + rollback on error |
| **Pros** | Best perceived performance (instant feedback); minimal network traffic; user sees cart badge increment in real-time; naturally collapses burst into single request; combined with backend UPSERT, even if two debounced requests overlap they are handled atomically |
| **Cons** | More complex implementation (optimistic cache manipulation, rollback logic); if user closes tab during debounce window, API never fires (minor — cart is session-based, user re-adds on next visit); brief UI/server inconsistency during debounce window (acceptable since reconciliation happens within 1s) |

---

## Comparison Matrix

| Criterion | A: Debounce | B: Serial Queue | C: Disable Button | **D: Optimistic + Debounce** |
|---|---|---|---|---|
| Perceived latency | 300ms | 0ms per click | 0ms (1st only) | **0ms** |
| Visual feedback | Delayed | Stepwise | Blocked | **Instant** |
| Network requests (5 clicks) | 1 | 5 | ~1 | **1** |
| Backend load | Low | High | Low | **Low** |
| Implementation effort | Low | Low | Trivial | **Medium** |
| Handles rapid clicks | Yes | Yes (queued) | No (blocked) | **Yes** |
| UX quality | Okay | Okay | Poor | **Best** |
| Session race fix | Yes (1 req) | No (5 reqs) | Partial | **Yes (1 req)** |

**Decision: Option D** — best UX (instant feedback) with same network efficiency
as Option A. The added implementation complexity is justified by the superior
user experience.

---

## Layer 3: Session Race Fix (eliminates root cause #2)

No options here — single clear fix:

- After the **first** addToCart response returns a `Set-Cookie` header, ensure
  subsequent requests include that cookie.
- Frontend: serialize the very first addToCart call (block further mutations
  until the first response is received, which sets the cookie).
- This is automatically handled by **Frontend Option D** (debounce), because
  debouncing collapses the burst into one request.
- As additional safety, the backend RPC function can be wrapped with a session
  existence check + creation that uses `INSERT ... ON CONFLICT DO NOTHING` to
  prevent duplicate session creation.

---

## Summary — Chosen Approach

| Layer | Choice | Effect |
|---|---|---|
| Backend | Option A: PostgreSQL UPSERT RPC | Atomic, 1 query, zero race window |
| Frontend | Option D: Optimistic UI + Debounced API | 0ms perceived latency, 1 request per burst |
| Session | Auto-fixed by frontend debounce + backend ON CONFLICT | No orphaned sessions |
