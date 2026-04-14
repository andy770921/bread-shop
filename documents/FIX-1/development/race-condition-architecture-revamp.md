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

## Additional Production Observation

After rollout, a second race condition was observed outside the LINE checkout submit boundary.

Observed sequence:

1. the shopper adds many products rapidly on the homepage
2. the header cart badge updates immediately from optimistic cache
3. the shopper navigates to `/cart` before all homepage debounced writes finish
4. `/cart` initially looks correct because it is still rendering optimistic cache state
5. when the shopper edits a line item on `/cart`, some other items can disappear

The disappearing items are not random.
They are usually the line items whose homepage mutations had not fully settled on the backend when `/cart` started editing.

## Root Cause Extension

The earlier fix correctly moved checkout creation to a server-side draft boundary, but it did not yet establish a **cart-page settlement boundary**.

That meant:

- homepage add-to-cart could still be pending
- `/cart` could still open on optimistic state
- `/cart` line-item mutation success could overwrite the cache with a server snapshot that did not yet include every pending homepage write

There was also a backend consistency gap:

- authenticated `POST /api/cart/items` was not resolving cart ownership with `userId`
- cart editing paths did use authenticated cart ownership
- that mismatch could split one shopper across a `session cart` and a `user cart`

## Follow-up Code Changes

The follow-up fix adds two protections.

### 1. `/cart` now acts as a synchronization boundary

Implemented in:

- `frontend/src/app/cart/page.tsx`

Behavior:

- when `/cart` mounts, it flushes pending cart mutations from previous pages
- it invalidates and re-fetches the authoritative cart
- quantity edits, remove actions, and checkout submission stay disabled until synchronization finishes

Important design note:

- this is done on the `/cart` route boundary
- it is intentionally **not** attached to the header cart icon click

The route boundary is the stable place to do this. A click handler is not.

### 2. Active-cart resolution now self-heals split carts

Implemented in:

- `backend/src/cart/cart.controller.ts`
- `backend/src/cart/cart.service.ts`

Behavior:

- authenticated add-to-cart now passes `userId` into the cart service
- `resolveCart()` can merge a split `session cart` into the active `user cart`
- authenticated session carts are re-linked to the current user/session when needed

This reduces the chance that one shopper ends up editing one cart while another cart still contains some of their recent items.

## Additional Production Observation: Missing Items On First `/cart` Render

After the cart-page synchronization fix, another failure mode was still observed.

Observed sequence:

1. the shopper rapidly adds multiple different products on the homepage
2. the header badge reaches the expected optimistic total
3. the shopper navigates to `/cart`
4. `/cart` already shows only a subset of the products on first render, before any cart-page edit happens

This behavior means the problem is not only a `/cart` reconciliation problem.
It also exists earlier in the write path.

## Deeper Root Cause Extension

The homepage add-to-cart flow was still allowing multiple different product writes to be sent nearly at the same time.

That created a second race:

- several debounced `POST /api/cart/items` requests could leave the homepage together
- if no active cart existed yet, more than one request could race through cart creation
- some requests would succeed against one cart while others would recover against another cart or fail during create timing
- the header badge still looked correct because it was driven by optimistic cache
- but the authoritative backend cart could already be missing some of those products before `/cart` was opened

In short:

- the previous fix established a safer read/edit boundary on `/cart`
- but it did not yet fully stabilize the **write boundary on the homepage**

## Additional Follow-up Code Changes

The follow-up fix adds two more protections.

### 3. Frontend cart writes are now serialized per hook instance

Implemented in:

- `frontend/src/queries/use-debounced-cart-mutation.ts`

Behavior:

- pending debounced cart writes are no longer fired in parallel from the same mutation controller
- when multiple product writes are ready at the same time, they are sent one after another
- this reduces the chance that several homepage requests all try to create or discover the active cart concurrently

This is still compatible with optimistic UI, but it removes a dangerous write burst at the backend boundary.

### 4. Backend cart creation now recovers from create-time races

Implemented in:

- `backend/src/cart/cart.service.ts`

Behavior:

- if `resolveCart()` loses a race while creating the active cart
- it does not immediately fail the cart write
- it re-reads the active cart for the session/user and continues if another request already created it

This is a defensive recovery layer around the current application-level cart resolver.

## Additional Regression Coverage

Added tests:

- `frontend/src/queries/use-debounced-cart-mutation.spec.tsx`
- `backend/src/cart/cart.service.spec.ts`

Covered cases:

- multiple pending frontend cart writes are serialized instead of sent in parallel
- cart creation can recover by re-reading the active cart after a create race
