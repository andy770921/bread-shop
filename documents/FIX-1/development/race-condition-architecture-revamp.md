# Race Condition Architecture Revamp

## Implemented Summary

This document summarizes the architecture change that has already been implemented in the codebase.

The change is intentionally incremental. It does not fully redesign cart persistence yet, but it does move the LINE checkout flow to a safer server-controlled boundary.

## What Was Implemented

### 1. LINE checkout now starts from one server-side draft boundary

The backend now treats `pending_line_orders` as the current checkout draft mechanism.

Implemented behavior:

- `POST /api/auth/line/start` canonicalizes the checkout cart before continuing.
- The backend stores the checkout draft on the server before any LINE redirect or confirmation step.
- The backend decides the next action and returns one of:
  - `next = 'line_login'`
  - `next = 'confirm'`
  - `next = 'not_friend'`

Primary file:

- `backend/src/auth/auth.controller.ts`

### 2. The frontend no longer bypasses the draft for linked LINE users

Previously, the linked-user branch could go directly from the mutable frontend cart to:

- order creation
- LINE send
- order confirmation

That bypass has been removed from the main LINE checkout path.

Implemented behavior:

- the frontend flushes pending cart mutations
- reads the current cart snapshot from React Query
- calls `POST /api/auth/line/start`
- follows the backend response

Primary files:

- `frontend/src/features/checkout/use-checkout-flow.ts`
- `frontend/src/queries/use-checkout.ts`

### 3. Final LINE order confirmation now converges on the server-side pending draft

The current flow is now much more consistent:

- guest checkout after LINE OAuth starts from the pending draft
- linked-user checkout starts from the same pending draft
- recovery after friend-check failure still uses the pending draft

This removes one of the biggest sources of divergence in the old design.

Primary files:

- `backend/src/auth/auth.controller.ts`
- `backend/src/checkout/checkout.service.ts`

### 4. Server-side cart canonicalization remains the trust boundary

The backend still recomputes checkout data server-side instead of trusting client totals.

Implemented behavior:

- validate active products
- normalize duplicated or malformed line items
- clamp invalid quantities
- recompute subtotal, shipping fee, and total on the server

Primary file:

- `backend/src/order/order.service.ts`

### 5. Dead frontend checkout mapping was removed from the cart-page LINE path

The cart form layer now focuses on:

- form validation
- payment selection
- LINE-specific field validation

It no longer owns direct order payload generation for the main LINE checkout path.

Primary file:

- `frontend/src/features/checkout/cart-form.ts`

### 6. Tests were updated for the new draft-oriented flow

Updated coverage includes:

- backend `line/start` decision behavior
- frontend LINE checkout orchestration
- blocked friend flow
- linked-user confirmation flow
- guest redirect flow

Primary test files:

- `backend/src/auth/auth.controller.spec.ts`
- `frontend/src/features/checkout/use-checkout-flow.spec.ts`
- `frontend/src/app/cart/page.spec.tsx`
- `frontend/src/features/checkout/cart-form.spec.ts`

### 7. Verification was completed

The implemented phase was verified with:

- `npm run lint`
- `npm run test`

## Database Impact of the Implemented Phase

This implemented phase does **not** require a Supabase schema migration.

Reason:

- it reuses the existing `pending_line_orders`
- it reuses the existing `form_data` JSON payload
- internal values such as `_cart_snapshot`, `_user_id`, `_line_user_id`, and `_link_user_id` are stored inside the existing JSON structure
- it does not add new tables
- it does not add new columns
- it does not change constraints, indexes, or RPC functions

Short version:

- the implemented phase: no DB migration required

## Why This Is Still Not the Final Architecture

This change improves checkout consistency, but it does not fully solve the deeper cart architecture problem.

The current cart model still has important limitations:

- cart persistence is still centered on `sessions + cart_items`
- homepage add-to-cart still depends on optimistic frontend behavior
- debounced writes still exist in the cart mutation path
- checkout still needs a client snapshot as a safety mechanism

That means the current implementation is a safer transitional design, not the final ecommerce architecture.

## Recommended Long-Term Direction

Long term, I recommend a DB-backed redesign around:

- server-authoritative cart
- explicit checkout draft
- order created from the draft, not from the mutable cart

Recommended future data models:

- `carts`
- `cart_lines`
- `checkout_drafts`

Likely supporting additions:

- cart versioning
- draft status and expiration fields
- idempotency keys
- explicit linkage from order to checkout draft

Short version:

- the implemented phase: no DB migration required
- the full architecture revamp: DB redesign and migration required

## Recommended Planning Split

The full revamp should be split into:

1. a short-term architecture cleanup that does not require DB changes
2. a medium- and long-term architecture redesign that does require DB changes
3. a phase-by-phase migration plan with matching API changes

The DB redesign plan and the implementation steps for that plan are documented separately in:

- `documents/FIX-1/plans/race-condition-db-revamp.md`
- `documents/FIX-1/development/race-condition-db-revamp.md`
