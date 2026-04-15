# FEAT-3 Development: Remove Lemon Squeezy Checkout

## Summary

This change removes the active Lemon Squeezy integration from the application and leaves LINE as the only supported checkout path. The `/cart` page still shows a credit-card option in the dropdown, but selecting it now renders a placeholder notice instead of payment inputs or a checkout action.

## Implementation Details

### 1. Backend cleanup

- Removed the entire payment module:
  - `backend/src/payment/payment.controller.ts`
  - `backend/src/payment/payment.module.ts`
  - `backend/src/payment/payment.service.ts`
  - `backend/src/payment/payment.service.spec.ts`
- Removed `PaymentModule` from `backend/src/app.module.ts`
- Removed Lemon Squeezy-specific bootstrap and middleware handling:
  - `NestFactory.create(AppModule, { rawBody: true })` was simplified to `NestFactory.create(AppModule)`
  - The session middleware no longer excludes webhook routes
- Removed Lemon Squeezy environment variables from `backend/.env.example`

### 2. Backend and shared type narrowing

- `backend/src/order/dto/create-order.dto.ts`
  - `payment_method` now only accepts `line`
- `backend/src/order/order.service.ts`
  - order creation now only accepts `payment_method: 'line'`
- `shared/src/types/order.ts`
  - active `PaymentMethod` is now `line`
  - removed the unused `CheckoutResponse` type

### 3. Frontend checkout removal

- `frontend/src/features/checkout/cart-form.ts`
  - removed credit-card field validation
  - `toCreateOrderBody()` now throws if called for `credit_card`
- `frontend/src/features/checkout/use-checkout-flow.ts`
  - removed the external checkout redirect branch
  - credit-card submission now fails immediately before any order creation
  - LINE checkout remains unchanged
- `frontend/src/queries/use-checkout.ts`
  - `useCreateOrder()` now expects a normal `Order` response without `checkout_url`

### 4. Cart UI update

- `frontend/src/app/cart/page.tsx`
  - removed credit-card form fields
  - removed the credit-card submit button
  - selecting `credit_card` now shows the notice `申請信用卡服務中`
- `frontend/src/i18n/zh.json`
  - added `cart.creditCardServicePending: "申請信用卡服務中"`
- `frontend/src/i18n/en.json`
  - added the English equivalent for non-Chinese locales

### 5. Test updates

- Updated checkout form tests to reflect that credit-card fields no longer exist and the backend payload mapper rejects that path
- Updated checkout flow tests to verify credit-card submission is blocked before order creation
- Updated cart page tests to verify the new placeholder UI appears when the credit-card option is selected
- Removed the Lemon Squeezy payment service test with the deleted backend payment module

## Verification Notes

Targeted test execution should cover:

- `backend/src/order/order.service.spec.ts`
- `frontend/src/features/checkout/cart-form.spec.ts`
- `frontend/src/features/checkout/use-checkout-flow.spec.ts`
- `frontend/src/app/cart/page.spec.tsx`

Post-change code search should show no remaining Lemon Squeezy references in active runtime code under `backend`, `frontend`, and `shared`.
