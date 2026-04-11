# FIX-2: LINE Checkout Flow — Root Cause Analysis & Fix Plan

## Problem Statement

When a user selects "透過 LINE 聯繫" on the `/cart` page:

1. An error toast appears ("LINE 傳送失敗，但訂單已建立"), but the app still navigates to the success page showing an order number.
2. On failure, the user should stay on `/cart` with all cart items intact.
3. On success, cart items should be cleared so the user can place a new order.

## Root Cause Analysis

### Cause 1: Navigation happens unconditionally after LINE send failure

**File:** `frontend/src/app/cart/page.tsx`, lines 89–112

The `handleCheckout` function has a two-step flow for LINE payment:

1. `POST /api/orders` — creates the order (succeeds)
2. `POST /api/orders/:id/line-send` — sends LINE message (fails)

When step 2 fails, the code shows a toast but does **not** return or throw. Execution falls through to the navigation block (line 111), which unconditionally does `router.push('/checkout/success')` since `paymentMethod !== 'lemon_squeezy'`.

```typescript
// After LINE send fails:
if (!lineRes.ok) {
  toast.error('LINE 傳送失敗，但訂單已建立');
  // BUG: no return — falls through to router.push below
}

// This runs regardless of LINE send result:
router.push(`/checkout/success?order=${orderData.order_number}`);
```

### Cause 2: Backend clears cart during order creation, before LINE send

**File:** `backend/src/order/order.service.ts`, line 81

`createOrder()` calls `this.cartService.clearCart()` immediately after inserting order items. This happens in step 1, before the LINE send in step 2 even starts. So by the time LINE send fails, the cart is already empty — there's nothing to "restore".

```
Timeline:
  POST /api/orders  →  order created  →  cart cleared  →  response returned
  POST /api/orders/:id/line-send  →  fails (401 or no LINE user ID)
  Frontend: toast error + navigate to success (cart already empty)
```

### Cause 3: LINE send requires auth but order creation doesn't

**File:** `backend/src/line/line.controller.ts`, line 17

- Order creation uses `OptionalAuthGuard` — works for guests.
- LINE send uses `AuthGuard` — requires a Bearer token.

A guest user (no token) can create an order but the subsequent LINE send will always fail with 401. Even a logged-in user may fail if they haven't linked LINE (no `line_user_id` in profile).

### Cause 4: Frontend doesn't invalidate cart query on success

After a successful checkout, the frontend navigates to the success page but never calls `queryClient.invalidateQueries(['cart'])`. The TanStack Query cache still holds the old cart data. If the user navigates back, they may see stale items until the cache expires or the page refetches.

## Fix Strategy

The core design change: **treat order creation and LINE send as a single atomic user action**. If the LINE send step fails, the order should be rolled back and the user stays on `/cart`.

### Frontend changes (`cart/page.tsx`)

1. **Pre-flight auth check**: If `payment_method === 'line'` and user has no token, show a toast ("請先登入才能透過 LINE 聯繫") and return immediately — no order is created, no orphaned data.
2. If LINE send fails after order creation, **stay on `/cart`** (no navigation). Cart items remain because cart was not cleared.
3. If LINE send succeeds, call `/api/orders/:id/confirm` to clear cart, then navigate to success page.
4. On successful checkout (any method), invalidate the `['cart']` query to ensure the cache reflects the cleared cart.

### Backend changes (`order.service.ts`)

1. Add a `deleteOrder(orderId)` method that removes order items and the order, then restores cart items. Alternatively, defer cart clearing: don't clear cart during `createOrder()` for LINE payment method — only clear after LINE send succeeds (via a new endpoint or by having the frontend call a cart-clear endpoint).

**Chosen approach:** Defer cart clearing for LINE orders.

- `createOrder()` accepts a `skipCartClear` flag. When `payment_method === 'line'`, the frontend sends `skip_cart_clear: true`.
- Add a new `POST /api/orders/:id/confirm` endpoint that clears the cart. The frontend calls this after LINE send succeeds.
- For `lemon_squeezy`, cart is still cleared immediately (payment handled by redirect/webhook).

### Backend changes (`order.controller.ts`)

- Add `POST /api/orders/:id/confirm` endpoint (uses `OptionalAuthGuard`) that calls `cartService.clearCart()`.

### Backend changes (`line.controller.ts`)

- No guard change needed. The LINE send endpoint rightfully requires auth since it needs `user.id` to look up `line_user_id`. The frontend should only show the LINE option when the user is logged in, or handle the 401 gracefully.
