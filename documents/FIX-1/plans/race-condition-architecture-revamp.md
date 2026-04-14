# Race Condition Architecture Revamp

## Goal

Move the LINE checkout flow away from:

- frontend-direct order creation from a mutable cart
- split logic between "linked user" and "needs LINE login" branches
- checkout correctness that depends on the frontend re-fetching the live cart at exactly the right moment

and toward:

- **one server-side checkout draft boundary**
- **one frontend entrypoint for LINE checkout**
- **order creation from the checkout draft, not directly from the mutable cart**

This document is intentionally concrete.
It describes the code changes to make in the current codebase, step by step.

---

## Scope of This Revamp

This implementation does **not** fully redesign cart persistence yet.

It does **not**:

- replace the existing cart tables
- add a new `checkout_drafts` table
- remove all optimistic cart behavior
- redesign homepage add-to-cart writes

It **does**:

1. treat `pending_line_orders` as the current checkout-draft mechanism
2. make LINE checkout always start by creating that server-side draft
3. remove the frontend bypass where linked users create orders directly from the cart
4. make both LINE branches finish from the same draft object

This is an incremental architecture step that reduces state divergence immediately.

---

## Target Flow After This Change

### A. User clicks `LINE Contact`

Frontend always does:

1. flush pending cart mutations
2. capture the current cart snapshot from query cache
3. call `POST /api/auth/line/start`

### B. Backend creates a draft and decides the next step

`POST /api/auth/line/start` becomes the single orchestration decision point.

It returns:

- `next = 'line_login'`
- `next = 'confirm'`
- `next = 'not_friend'`

### C. Frontend follows the backend decision

- `line_login`: redirect to `/api/auth/line?pending=...`
- `not_friend`: route to `/checkout/failed?reason=not_friend`
- `confirm`: call `POST /api/auth/line/confirm-order` with the returned `pendingId`

### D. Final order creation always happens from the draft

That means:

- guest path after LINE OAuth
- linked user path without OAuth
- pending recovery path after add-friend flow

all converge on the same server-side draft lifecycle.

---

## Step-by-Step Implementation Plan

## Step 1: Make `line/start` return an orchestration decision

### Why

Today the frontend decides too much:

- whether checkout starts LINE login
- whether checkout should create the order directly
- whether checkout should use the pending flow

That is backwards.
The backend should decide the next step once it has:

- the current authenticated user, if any
- the linked LINE identity, if any
- the canonical checkout snapshot

### Code changes

#### File: `backend/src/auth/auth.controller.ts`

Change `POST /api/auth/line/start` so it:

1. canonicalizes the checkout cart snapshot via `OrderService.getCheckoutCartSnapshot()`
2. stores the draft in `pending_line_orders`
3. checks whether the current authenticated user already has `profiles.line_user_id`
4. returns a response shape like:

```ts
type LineStartResponse =
  | { pendingId: string; next: 'line_login' }
  | { pendingId: string; next: 'confirm' }
  | { pendingId: string; next: 'not_friend'; addFriendUrl: string };
```

### Additional backend behavior

When the authenticated user is already linked, `line/start` should store:

- `_user_id`
- `_line_user_id`

inside the pending draft so `confirm-order` can execute immediately without going through LINE callback first.

When the authenticated user exists but is **not** yet linked, `line/start` should still store:

- `_link_user_id`

so the later LINE OAuth callback can attach the LINE account to the correct Bread Shop user.

### Tests

#### File: `backend/src/auth/auth.controller.spec.ts`

Add or update tests for:

1. guest start returns `next = 'line_login'`
2. authenticated but unlinked user returns `next = 'line_login'`
3. authenticated linked user who can receive messages returns `next = 'confirm'`
4. authenticated linked user who cannot receive messages returns `next = 'not_friend'`

---

## Step 2: Unify frontend LINE checkout around `line/start`

### Why

Today the linked-user checkout branch bypasses the draft and goes through:

- `POST /api/orders`
- `POST /api/orders/:id/line-send`
- `POST /api/orders/:id/confirm`

That bypass is exactly the architectural split we want to eliminate.

### Code changes

#### File: `frontend/src/features/checkout/use-checkout-flow.ts`

Rewrite `submitCheckout()` so it always:

1. flushes pending cart mutations
2. reads the current cart snapshot from `QUERY_KEYS.cart`
3. calls `POST /api/auth/line/start`
4. switches on `start.next`

Pseudo-flow:

```ts
const start = await startLineCheckout({ form_data: values, cart_snapshot: checkoutCartSnapshot });

if (start.next === 'line_login') {
  redirectTo(`/api/auth/line?pending=${start.pendingId}`);
  return { status: 'redirected' };
}

if (start.next === 'not_friend') {
  return { status: 'needs_friend', addFriendUrl: start.addFriendUrl };
}

const confirmed = await confirmPendingLineOrder(start.pendingId);
await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart });
router.push(`/checkout/success?order=${confirmed.order_number}`);
return { status: 'completed' };
```

### Effect

The frontend no longer creates LINE orders directly from the mutable cart.
It always goes through the draft boundary first.

---

## Step 3: Replace direct LINE checkout transport helpers

### Why

The current frontend transport layer still encodes the old bypass:

- `useCreateOrder()`
- `useLineSend()`
- `useConfirmOrder()`

For the main LINE checkout path, these are now the wrong abstractions.

### Code changes

#### File: `frontend/src/queries/use-checkout.ts`

Replace the direct-order LINE helpers with draft-oriented helpers:

```ts
export function useStartLineCheckout() { ... }    // POST /api/auth/line/start
export function useConfirmPendingLineOrder() { ... } // POST /api/auth/line/confirm-order
```

Return types should match the new backend response shape from Step 1.

### Effect

This prevents future frontend work from accidentally reintroducing the direct cart -> order LINE path.

### Tests

#### Files

- `frontend/src/features/checkout/use-checkout-flow.spec.ts`
- `frontend/src/app/cart/page.spec.tsx`

Update tests so they verify:

1. checkout starts with `line/start`
2. linked reachable users go `line/start -> confirm-order -> success`
3. not-friend users do **not** create orders directly
4. guests redirect to LINE login using the returned `pendingId`

---

## Step 4: Remove dead direct-order checkout mapping from the frontend

### Why

Once LINE checkout no longer creates orders directly from the cart page, the form layer should stop producing direct order payloads for that path.

### Code changes

#### File: `frontend/src/features/checkout/cart-form.ts`

Keep:

- schema validation
- `paymentMethods`
- `isLineTransferPayment()`

Remove:

- the direct LINE order payload mapping helper if it is no longer used by checkout

#### File: `frontend/src/features/checkout/cart-form.spec.ts`

Update tests accordingly:

- keep validation tests
- remove tests that assert direct order payload mapping for the cart page LINE flow

---

## Step 5: Keep backend order canonicalization as a safety layer

### Why

Even though the primary path now creates orders from the draft, the backend should still preserve canonicalization logic:

- validate active products
- canonicalize product metadata
- recompute totals server-side

### Code changes

#### File: `backend/src/order/order.service.ts`

Keep `getCheckoutCartSnapshot()` and the normalization logic as the server-side trust boundary for:

- draft creation
- pending checkout recovery
- any temporary compatibility path that still creates orders from a snapshot

This is still the correct trust model.

---

## Step 6: Verification

### Lint

Run:

```bash
npm run lint
```

### Tests

Run:

```bash
npm run test
```

Focus especially on:

- `frontend/src/features/checkout/use-checkout-flow.spec.ts`
- `frontend/src/app/cart/page.spec.tsx`
- `backend/src/auth/auth.controller.spec.ts`
- `backend/src/checkout/checkout.service.spec.ts`

---

## Expected Architectural Outcome

After this revamp:

1. LINE checkout has one backend-controlled entrypoint
2. linked and unlinked users both start from the same server-side draft
3. final order creation always happens from the draft boundary
4. the frontend no longer bypasses that boundary for linked users

This is not the final ecommerce architecture yet, but it is a meaningful move toward:

> server-authoritative checkout flow with a real snapshot boundary

