# REFACTOR-3: Architecture Review — Deep Module Candidates

## Scope

Full-stack review of the Papa Bakery codebase (NestJS backend + Next.js frontend), aligned to the current tree as of 2026-04-14. This document focuses on the deeper structural issues that remain after earlier cleanup work.

To reduce document drift, the findings below reference stable file and method names instead of volatile line numbers where possible.

---

## Backend Findings

### 1. AuthController LINE Pending-Order Flow — God Orchestrator (Critical)

**Files:**
- `backend/src/auth/auth.controller.ts` — `lineCallback()`, `confirmLineOrder()`, `handlePendingOrder()`, `checkLineFriendship()`, `sendLoadingPage()`
- `backend/src/auth/auth.controller.spec.ts` — controller tests currently spy on `handlePendingOrder()` instead of testing an extracted orchestration service

The pending-order LINE checkout flow now spans two endpoints and several private helpers:

1. Decode and validate HMAC `state`
2. Read the pending order and optional `_link_user_id`
3. Exchange LINE OAuth code and sign in or link the user
4. Branch on friendship status, optionally update pending-order auth metadata, and redirect to `/checkout/pending`
5. Atomically delete the pending order
6. Stream loading HTML back to the browser
7. Create the order from the pending cart snapshot
8. Assign `user_id` to the order via raw Supabase update
9. Merge sessions
10. Look up `profile.line_user_id` and send LINE notifications
11. Confirm the order and clear the cart
12. Build success or error redirect URLs with auth tokens
13. Reuse the same order-creation helper from `confirmLineOrder()`

**Problems:**
- The controller still owns the business state machine; it is not just routing.
- The flow is split across `lineCallback()` and `confirmLineOrder()`, so extracting only the callback tail would still leave orchestration fragmented.
- Direct `orders` and `profiles` queries inside the controller bypass service boundaries.
- Streaming HTML (`sendLoadingPage`) is mixed with business orchestration.
- Error handling is intentionally mixed between best-effort and fail-fast paths, but that policy is implicit and hard to test.
- There are controller tests, but no dedicated service boundary for the orchestration; the current spec has to spy on private helpers.

**Coupling:** `AuthController` depends on `AuthService`, `OrderService`, `LineService`, `SupabaseService`, `ConfigService`, and direct `fetch` calls to the LINE API.

---

### 2. Session Identity — Same Concept, Multiple Implementations

**Files:**
- `backend/src/common/middleware/session.middleware.ts` — `use()`
- `backend/src/cart/cart.service.ts` — `getSessionIds()`
- `backend/src/auth/auth.service.ts` — `mergeSessionOnLogin()`
- `backend/src/order/order.service.ts` — `confirmOrder()`, `getOrderById()`
- `backend/src/payment/payment.service.ts` — `createCheckout()`

**Problems:**
- Ownership is still resolved ad hoc with `user_id` vs `session_id` branches in each module.
- `CartService.getSessionIds()` and `SessionMiddleware` both read `sessions`, but there is no shared resolver or cache policy.
- `mergeSessionOnLogin()` deletes old sessions and cart rows, but other modules treat session rows as stable during request handling.
- Session creation is governed by a mix of HTTP method and hardcoded route heuristics. For example, non-GET routes like `POST /api/auth/line/start` get a session implicitly, while new GET routes still require editing the middleware allowlist.
- The middleware route list (`/cart`, `/favorites`, `/orders`, `/auth/me`, `/user/`) remains a hidden coupling point.

**Coupling:** Implicit — shared table plus `req.sessionId` / `req.userId` convention, but no shared abstraction.

---

### 3. Order Lifecycle — No Single Owner

**Files:**
- `backend/src/order/order.service.ts` — `createOrder()`
- `backend/src/payment/payment.service.ts` — `handleWebhook()`
- `backend/src/auth/auth.controller.ts` — `handlePendingOrder()`
- `backend/src/line/line.service.ts` — `sendOrderMessage()`
- `shared/src/types/order.ts` — `OrderStatus`

**Problems:**
- `OrderService` creates orders with `status: 'pending'`, but `PaymentService` transitions status via raw Supabase updates.
- `AuthController` directly sets `orders.user_id` instead of going through `OrderService`.
- `LineService.sendOrderMessage()` directly sets `orders.line_user_id`, so even non-status order mutations are not centrally owned.
- `shared/src/types/order.ts` already exposes `pending | paid | preparing | shipping | delivered | cancelled`, but backend code has no transition owner aligned with that union.
- If order-side effects change later, every writer to `orders` has to be updated separately.

---

### 4. Duplicated Order Fetching

**Files:**
- `backend/src/order/order.service.ts` — `getOrderById()`
- `backend/src/line/line.service.ts` — `sendOrderToAdmin()`, `sendOrderMessage()`
- `backend/src/payment/payment.service.ts` — `createCheckout()`

**Problems:**
- The same `orders + order_items` query is duplicated across modules.
- Schema changes require hand-editing multiple services.
- `LineService` and `PaymentService` bypass `OrderService`, so any validation or mapping added there will be skipped.

---

### 5. Business Rules Scattered Across Layers

| Business Rule | Location(s) |
|---|---|
| Shipping fee: free if subtotal >= 500 | `backend/src/cart/cart.service.ts`, `frontend/src/queries/use-cart.ts` |
| Quantity cap: max 99 | `backend/src/auth/auth.service.ts`, `frontend/src/queries/use-cart.ts` |
| Session expiry: 90 days | `backend/src/common/middleware/session.middleware.ts` |

**Problems:**
- Shipping threshold and quantity cap are duplicated between backend and frontend with no shared constant.
- Session max-age is duplicated even within the same middleware file.
- These are domain rules, but today they live as magic numbers inside implementation files.

---

## Frontend Findings

### 6. Cart Optimistic State Machine — Complex but Untestable

**File:** `frontend/src/queries/use-cart.ts`

Three independent concerns are still tangled in one file:
1. React Query integration
2. Debounce and reconciliation state machine
3. Cart math and quantity rules

**Problems:**
- `recalcCartTotals()`, `reconcileWithPending()`, and `applyPendingUpdates()` are pure logic but live inside a React hook file.
- Shipping logic is duplicated from the backend.
- `useAddToCart()` and `useUpdateCartItem()` each manage their own timer-driven pending state via `useRef`.
- The two mutation hooks still duplicate most of the debounce and reconciliation pattern.

---

### 7. Auth Token Lifecycle — Fragmented

**Files:**
- `frontend/src/lib/auth-context.tsx`
- `frontend/src/utils/fetchers/fetchers.client.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/api-client.ts`

**Problems:**
- `AuthProvider` manages token state, but `authedFetchFn` reads directly from `localStorage`.
- `frontend/src/lib/api.ts` is dead code today.
- `frontend/src/lib/api-client.ts` also appears unreferenced in the current tree and should be treated as a second dead-code candidate.
- Auth context still directly invalidates `['cart']`, so auth state knows concrete query keys.

---

### 8. Checkout Flow — Page-Level Orchestration Still Owns the Decision Tree

**Files:**
- `frontend/src/app/cart/page.tsx` — `cartFormSchema`, `onSubmit`, conditional field resets, LINE redirect handling, cart invalidation
- `frontend/src/queries/use-checkout.ts` — thin mutation wrappers only

The raw network mutations have been moved into hooks, but the cart page still owns the checkout state machine:

- inline Zod schema
- payment method branching
- pending-order redirect into LINE login
- direct order create -> LINE send -> confirm sequence
- navigation, toast, and query invalidation policy

**Problems:**
- Adding a new payment method still means editing a page component.
- The LINE flow is encoded as nested `if` branches instead of a named coordinator.
- The validation schema is not reusable outside the page.
- Business orchestration is split awkwardly: `use-checkout.ts` owns transport, while `page.tsx` owns policy.

---

## Summary of Candidates (Prioritized)

| # | Candidate | Type | Severity | Effort |
|---|---|---|---|---|
| 1 | Pending-Order Checkout Orchestrator (backend) | Extract service from `AuthController` | Critical | Medium |
| 2 | Session Identity Resolution (backend) | Unify session ownership logic | High | Medium |
| 3 | Order Lifecycle Owner (backend) | Centralize transitions and metadata writes | High | Medium |
| 4 | Cart State Machine (frontend) | Extract pure logic from React hooks | Medium | Medium |
| 5 | Checkout Flow Coordinator (frontend) | Extract page-level orchestration + schema | Medium | Medium |
| 6 | Duplicated Order Fetching (backend) | Route reads through `OrderService` | Medium | Low |
| 7 | Auth Token Lifecycle (frontend) | Remove dead helpers + unify auth read path | Low | Low |
| 8 | Shared Business Constants | Extract shipping / quantity / session constants | Low | Low |
