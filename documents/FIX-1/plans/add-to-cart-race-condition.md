# FIX-1: Rapid Add-to-Cart Drops Items — Root Cause Analysis

## Symptom

User clicks "Add to Cart" 5 times rapidly on a cookie product. The backend responds
slowly, and only 2-3 items end up in the cart instead of 5.

---

## Root Causes (ordered by severity)

### 1. Backend Race Condition — Read-Then-Write Without Atomicity (CRITICAL)

`cart.service.ts:addItem()` uses a **SELECT → branch → UPDATE/INSERT** pattern:

```
Request A: SELECT cart_items WHERE session_id=X AND product_id=Y  →  not found
Request B: SELECT cart_items WHERE session_id=X AND product_id=Y  →  not found   (concurrent)
Request C: SELECT cart_items WHERE session_id=X AND product_id=Y  →  not found   (concurrent)
Request A: INSERT cart_items (session_id=X, product_id=Y, quantity=1)
Request B: INSERT cart_items (session_id=X, product_id=Y, quantity=1)  →  duplicate or overwrites
Request C: INSERT cart_items (session_id=X, product_id=Y, quantity=1)  →  duplicate or overwrites
```

When the first INSERT hasn't committed before the other SELECTs run, all requests
see "no existing item" and each tries to INSERT. Depending on whether there is a
UNIQUE constraint on `(session_id, product_id)`:

- **With UNIQUE constraint**: later INSERTs fail silently → items lost.
- **Without UNIQUE constraint**: multiple rows created → inconsistent data.

Even when some requests DO see an existing row, they all read the **same** quantity
and compute the same new value → **lost updates** (e.g., all 3 read qty=1, all
write qty=2, final result is 2 instead of 4).

### 2. Session Creation Race Condition (HIGH)

For a brand-new visitor (no `session_id` cookie yet), the **first** click triggers
session creation inside `SessionMiddleware`. But if 5 clicks fire before the first
response sets the `Set-Cookie` header, all 5 requests arrive **without** a
`session_id` cookie.

The middleware creates a **new session for each request**, sets **different**
`session_id` cookies on each response, and the browser keeps only the **last**
cookie. Result: 4 out of 5 cart items are orphaned in sessions that the browser
no longer references.

### 3. Frontend Fires N Independent Concurrent Requests (MEDIUM)

`useAddToCart()` (TanStack Query mutation) has:

- **No debounce / throttle** — each click fires immediately
- **No serial queue** — mutations run concurrently
- **No optimistic accumulation** — quantity is always `1` per request
- **No button disable** while a mutation is in-flight

This means 5 rapid clicks = 5 parallel POST requests hitting the backend
simultaneously, maximizing the race condition window.

### 4. No Database-Level Safeguard (MEDIUM)

- No UNIQUE constraint on `(session_id, product_id)` to enforce one row per product per session.
- No PostgreSQL function / UPSERT to atomically increment quantity.
- No advisory lock or row-level lock (SELECT FOR UPDATE).

### 5. Session Expiry Fire-and-Forget (LOW)

In `session.middleware.ts`, the session expiry refresh is `.then()` (not awaited).
Under heavy load this can silently fail, but it's not the primary cause of
dropped items.

---

## Impact Map

| Root Cause | Items Lost | Latency Increase | Affects |
|---|---|---|---|
| Backend read-then-write race | 1-4 per burst | Moderate (serial DB round-trips) | All concurrent addItem to same product |
| Session creation race | Up to N-1 per burst | High (N session INSERTs) | New visitors only (first ever click) |
| No frontend throttle | Amplifies #1 and #2 | N x backend latency | Every rapid-click scenario |
| No DB safeguard | Enables #1 | — | All addItem calls |

---

## Why It's Slow

Each `addItem` call makes **3-4 sequential Supabase queries** (validate product →
check existing → insert/update → getCart). With 5 concurrent requests, that's
15-20 DB round-trips competing for the same rows, plus session middleware adds
1-2 more queries each. Supabase is a remote PostgreSQL instance — each round-trip
has network latency (typically 50-200ms per query depending on region).
