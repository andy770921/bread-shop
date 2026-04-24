# FIX-2: Implementation Steps

## Step 1 — Backend: Defer cart clearing for LINE orders

**File:** `backend/src/order/order.service.ts`

- Add optional `skipCartClear` parameter to `createOrder()`.
- When `skipCartClear` is true, skip the `this.cartService.clearCart()` call.

**File:** `backend/src/order/dto/create-order.dto.ts`

- Add optional `skip_cart_clear?: boolean` field.

**File:** `backend/src/order/order.controller.ts`

- Pass `dto.skip_cart_clear` to `createOrder()`.

## Step 2 — Backend: Add order confirm endpoint

**File:** `backend/src/order/order.controller.ts`

- Add `POST /api/orders/:id/confirm` with `OptionalAuthGuard`.
- Calls `orderService.confirmOrder(orderId, sessionId, userId)`.

**File:** `backend/src/order/order.service.ts`

- Add `confirmOrder(orderId, sessionId, userId)` method.
- Verifies the order exists and belongs to the session/user.
- Calls `this.cartService.clearCart(sessionId, userId)`.

## Step 3 — Frontend: Fix LINE checkout flow

**File:** `frontend/src/app/cart/page.tsx`

Rewrite `handleCheckout` for LINE payment:

0. **Pre-flight auth check**: If `payment_method === 'line'` and no `token`, show toast and `return` immediately. This prevents orphaned orders from being created when user is not logged in.
1. Call `POST /api/orders` with `skip_cart_clear: true`.
2. Call `POST /api/orders/:id/line-send`.
3. **If LINE send fails:** show error toast, do NOT navigate. Cart items remain.
4. **If LINE send succeeds:** call `POST /api/orders/:id/confirm` to clear cart, then invalidate `['cart']` query, then navigate to success page.

For `lemon_squeezy` payment (no change to cart clearing logic):

1. Call `POST /api/orders` (cart cleared immediately on backend).
2. Invalidate `['cart']` query.
3. Redirect to checkout URL.

## Step 4 — Frontend: Invalidate cart query on success

**File:** `frontend/src/app/cart/page.tsx`

- Import `useQueryClient` from TanStack Query.
- After successful checkout (both methods), call `queryClient.invalidateQueries({ queryKey: ['cart'] })`.

## Summary of changes

| File                                        | Change                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `backend/src/order/order.service.ts`        | Add `skipCartClear` param to `createOrder()`, add `confirmOrder()` method            |
| `backend/src/order/dto/create-order.dto.ts` | Add `skip_cart_clear` optional field                                                 |
| `backend/src/order/order.controller.ts`     | Pass `skip_cart_clear`, add `POST :id/confirm` endpoint                              |
| `frontend/src/app/cart/page.tsx`            | Fix LINE flow (no navigate on fail, confirm+clear on success), invalidate cart query |
