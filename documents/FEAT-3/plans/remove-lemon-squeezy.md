# FEAT-3 Plan: Remove Lemon Squeezy Checkout

## Goal

Remove all active Lemon Squeezy checkout integration from the codebase so the system only supports the LINE checkout path for now, while keeping the credit-card option visible as a non-interactive placeholder in the cart UI.

## Scope

- Remove Lemon Squeezy environment variables from `backend/.env.example`
- Remove the backend payment module, checkout endpoint, webhook handler, and webhook-specific bootstrap/config wiring
- Narrow shared and backend order request types so new orders can only be created with `payment_method: 'line'`
- Replace the `/cart` credit-card checkout UI with a static message: `申請信用卡服務中`
- Prevent any frontend credit-card submission path from creating orders or redirecting to an external checkout
- Add implementation notes for this feature under `documents/FEAT-3/development`

## Planned Changes

### Backend

- Delete `backend/src/payment/*`
- Remove `PaymentModule` from `backend/src/app.module.ts`
- Remove webhook-specific middleware exclusions and raw-body bootstrap configuration that existed only for Lemon Squeezy
- Update `backend/src/order/dto/create-order.dto.ts` so `payment_method` only accepts `line`
- Update `backend/src/order/order.service.ts` so backend order creation only supports the LINE path

### Shared Types

- Update `shared/src/types/order.ts` to remove the Lemon Squeezy payment method from active type definitions
- Remove unused checkout-response types that were only relevant to external checkout redirects

### Frontend

- Remove the credit-card checkout payload mapping from `frontend/src/features/checkout/cart-form.ts`
- Remove the external checkout redirect branch from `frontend/src/features/checkout/use-checkout-flow.ts`
- Keep the credit-card dropdown option in `/cart`, but replace its content with a non-submit notice
- Ensure only the LINE flow can submit an order
- Update tests to reflect the new guarded behavior

## Verification

- Run targeted backend and frontend tests covering checkout form logic, checkout flow behavior, cart page behavior, and order service status transitions
- Search runtime code under `backend`, `frontend`, and `shared` for remaining Lemon Squeezy references after the refactor

## Non-Goals

- Rewriting historical feature documents from earlier milestones
- Introducing a replacement payment provider in this change set
