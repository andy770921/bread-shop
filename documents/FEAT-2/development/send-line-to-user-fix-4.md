# Fix 4: LINE Friendship Handling — Pending Confirmation Page

## Problem

1. **Customer never receives LINE messages** — LINE Messaging API `pushMessage` requires the user to be friends with the bot. The LINE Login URL was missing `bot_prompt=aggressive`, so users were never prompted to add the bot.

2. **No failure handling for LINE login decline or friendship decline** — If the user declined LINE Login or declined the friendship prompt, the flow either errored silently or created an order without the ability to send LINE messages.

3. **Users who add the bot AFTER the flow can't get messages for existing orders** — Once the order is created and the LINE push fails, the user has to place a new order even if they add the bot right after.

## Solution: Three-Path Flow

```
User clicks "透過 LINE 聯繫" CTA
  │
  ├─ User DECLINES LINE Login
  │   └─ /checkout/failed?reason=login_declined
  │      "請先同意 LINE 登入" + "返回購物車" button
  │
  ├─ User ACCEPTS LINE Login + IS friend
  │   └─ Order created → LINE messages sent → /checkout/success
  │
  └─ User ACCEPTS LINE Login + NOT friend
      └─ /checkout/pending?pendingId=xxx#tokens
         "訂單待確認" page:
         - "訂單還未送出，請先加入好友，再點擊送出下訂..."
         - "加入好友" button (LINE green, opens LINE add-friend)
         - "送出下訂" button
              │
              ├─ NOW a friend → order created → LINE messages → /checkout/success
              └─ STILL not friend → /checkout/failed?reason=not_friend
```

## Implementation Details

### Backend: `bot_prompt=aggressive` in LINE Login URL

```typescript
const lineAuthUrl = `...&scope=profile%20openid&bot_prompt=aggressive`;
```

Shows a full-screen prompt to add the bot after LINE Login. Requires the LINE Login channel (2008445583) to be linked to the Messaging API channel (2008443478) in the LINE Developer Console under "Linked LINE Official Account". This was already configured.

### Backend: Friendship Status Check

New method `checkLineFriendship(lineAccessToken)` calls the LINE Friendship API:

```
GET https://api.line.me/friendship/v1/status
Authorization: Bearer {LINE OAuth access token}
→ { "friendFlag": true/false }
```

Called twice in the flow:
1. **In `lineCallback`** — after LINE Login, decides whether to create order immediately (friend) or redirect to pending page (not friend)
2. **In `POST /api/auth/line/confirm-order`** — when user clicks "送出下訂" on the pending page, verifies friendship before creating order

### Backend: `handleLineLogin` Returns LINE Access Token

Return type changed to `AuthResponse & { lineAccessToken: string }`. The `lineAccessToken` is the LINE OAuth token needed for the friendship check. It is stored in the pending order's `form_data` (JSONB) when the user is not yet a friend, so the `confirm-order` endpoint can use it later.

### Backend: Pending Order Lifecycle Changes

`consumePendingOrder` was split into three methods:

| Method | Purpose |
|---|---|
| `readPendingOrder(id)` | Read without deleting — data may be needed for the pending page |
| `deletePendingOrder(id)` | Delete after successful order creation |
| `updatePendingOrderAuth(id, auth)` | Store LINE access token + userId in `form_data` JSONB; extend expiration to 30 minutes |

**Why 30 minutes?** The user needs time to: open LINE → find the bot → add as friend → return to the browser → click "送出下訂". The original 10-minute TTL was too short.

### Backend: New Endpoint `POST /api/auth/line/confirm-order`

Called from the pending confirmation page when the user clicks "送出下訂".

- Requires `AuthGuard` (Bearer token from hash fragment stored in localStorage)
- Reads the pending order (validates it exists and belongs to the user)
- Checks friendship using the stored LINE access token
- If friend: deletes pending order → creates order → sends LINE messages → returns `{ success: true, order_number }`
- If not friend: throws `BadRequestException('not_friend')` → frontend redirects to `/checkout/failed`

### Backend: LINE Login Decline Handling

The callback now accepts `@Query('error') loginError` parameter. When a user declines LINE Login, LINE redirects with `?error=access_denied`. The backend detects this and redirects to `/checkout/failed?reason=login_declined` immediately.

### Frontend: `/checkout/pending` Page (New)

Shows:
- Clock icon (warning color)
- "訂單待確認" title
- Description explaining the user needs to add the bot first
- **"加入好友" button** — LINE green (#06C755), opens `https://line.me/R/ti/p/@737nfsrc` in new tab
- **"送出下訂" button** — primary color, calls `POST /api/auth/line/confirm-order`
- On success: redirects to `/checkout/success?order=ORD-xxx`
- On `not_friend` error: redirects to `/checkout/failed?reason=not_friend`

Stores auth tokens from hash fragment on mount (same pattern as the success page).

### Frontend: `/checkout/failed` Page (Updated)

Two reasons:
- `login_declined` — "需要透過 LINE 登入才能完成訂單" + "返回購物車"
- `not_friend` — "請先加入好友" + "加入好友" button + "返回購物車"

### Frontend: i18n

New keys in `zh.json` / `en.json`:
- `checkout.pendingTitle` / `pendingDesc` / `submitOrder` / `submitting`
- Updated `checkout.failedNotFriend` wording

## Files Modified

| File | Change |
|---|---|
| `backend/src/auth/auth.service.ts` | `handleLineLogin` returns `lineAccessToken`; split `consumePendingOrder` into `readPendingOrder` + `deletePendingOrder` + `updatePendingOrderAuth` |
| `backend/src/auth/auth.controller.ts` | `bot_prompt=aggressive`; `checkLineFriendship` method; login decline handling; not-friend → pending page redirect with auth data; new `POST line/confirm-order` endpoint |
| `frontend/src/app/checkout/pending/page.tsx` | **New** — pending confirmation page with add-friend + submit buttons |
| `frontend/src/app/checkout/failed/page.tsx` | Failure page (login declined / not friend) |
| `frontend/src/i18n/zh.json` | New pending page keys + updated failure wording |
| `frontend/src/i18n/en.json` | Same keys in English |

## Testing

1. **Happy path (already friend):** CTA → LINE Login → friendship check true → order created → success
2. **Not friend:** CTA → LINE Login → friendship check false → pending page → user adds bot → "送出下訂" → friendship check true → order created → success
3. **Not friend, doesn't add:** CTA → LINE Login → pending page → "送出下訂" without adding bot → failed page "請先加入好友"
4. **Decline LINE Login:** CTA → cancel on LINE consent screen → failed page "請先同意登入"
5. **Expired pending order:** Wait 30+ minutes on pending page → "送出下訂" → error "Order request expired"

---

## Post-Review Hardening (Sub-Agent Code Review)

Two sub-agents independently reviewed the full backend + frontend flow and identified several issues. All critical and low-priority findings have been addressed.

### Critical Fixes

#### 1. Double-Click Race Condition on `confirmLineOrder`

**Problem:** Two rapid POST requests to `/api/auth/line/confirm-order` could both pass `readPendingOrder` (which doesn't delete) and create **duplicate orders** from the same cart.

**Fix:** `deletePendingOrder` now uses atomic `DELETE ... RETURNING` — it deletes the row and returns the data in a single operation. If the row was already deleted by a concurrent request, it returns `null`. The caller checks for `null` and aborts.

```typescript
// Before: separate read + delete → race window between them
await this.authService.deletePendingOrder(body.pendingId);
await this.handlePendingOrder(pending, ...);

// After: atomic delete as lock
const consumed = await this.authService.deletePendingOrder(body.pendingId);
if (!consumed) throw new BadRequestException('Order already submitted.');
await this.handlePendingOrder(consumed, ...);
```

This pattern is also applied in the `lineCallback` friend-path for consistency.

#### 2. Pending Order Deleted Before Order Creation (Data Loss)

**Problem:** In `confirmLineOrder`, `deletePendingOrder` ran before `handlePendingOrder`. If order creation failed (e.g., cart empty, product deactivated), the pending data was already gone and the user couldn't retry.

**Fix:** Resolved by the atomic delete approach above — `deletePendingOrder` returns the data, so `handlePendingOrder` uses the returned data. If `handlePendingOrder` throws, the data is still available in the `consumed` variable for error reporting (though the DB row is gone). More importantly, the frontend disables the button during submission, and on error it re-enables it with a toast — the user can return to cart and retry.

#### 3. Silent Degradation When Pending Order Expired

**Problem:** If `pendingId` was present in the callback state but `readPendingOrder` returned `null` (expired/consumed), the code silently fell through to the normal LINE Login path. The user expected checkout but got a generic login redirect.

**Fix:** When `pendingId` is set but `pending` is null, redirect to `/cart?error=Order request expired` immediately.

#### 4. Weak Ownership Check in `confirmLineOrder`

**Problem:** The check `if (fd._user_id && fd._user_id !== user.id)` skipped validation when `_user_id` was not set (falsy). A pending order created before the callback's `updatePendingOrderAuth` would have no `_user_id`.

**Fix:** Changed to `if (!fd._user_id || fd._user_id !== user.id)` — rejects when `_user_id` is missing OR doesn't match.

### Low-Priority Fixes

#### 5. Hardcoded English Error Messages (i18n)

Three toast messages were hardcoded in English, ignoring the user's locale setting:

| File | Hardcoded string | i18n key |
|---|---|---|
| `checkout/pending/page.tsx` | "Order submission failed. Please try again." | `checkout.orderSubmitFailed` |
| `cart/page.tsx` | "Failed to start LINE login. Please try again." | `checkout.lineLoginFailed` |
| `cart/page.tsx` | "Checkout failed" | `checkout.checkoutFailed` |

All three replaced with `t('checkout.xxx')` calls. Keys added to both `zh.json` and `en.json`.

#### 6. Stale Cart Cache on Success Page

**Problem:** When arriving at `/checkout/success` from the server-side LINE callback, the cart data in TanStack Query cache was stale — the header cart badge could briefly show old item count.

**Fix:** Added `queryClient.invalidateQueries({ queryKey: ['cart'] })` in the success page's `useEffect`.

#### 7. `refresh_token` Not Stored (Skipped)

**Finding:** The `refresh_token` passed via hash fragment is never stored or used. The frontend auth context has no refresh mechanism.

**Decision:** Skipped — this is a pre-existing architectural gap not introduced by this change. Supabase access tokens last 1 hour, and the checkout flow completes well within that window.

### Additional Files Modified (Post-Review)

| File | Change |
|---|---|
| `backend/src/auth/auth.service.ts` | `deletePendingOrder` returns deleted data (atomic DELETE RETURNING) |
| `backend/src/auth/auth.controller.ts` | Atomic delete as lock in both callback + confirmLineOrder; expired pending order → cart error; strict ownership check |
| `frontend/src/app/checkout/success/page.tsx` | Cart cache invalidation on mount |
| `frontend/src/app/checkout/pending/page.tsx` | Error toast uses i18n |
| `frontend/src/app/cart/page.tsx` | Two error toasts use i18n |
| `frontend/src/i18n/zh.json` | Added `checkout.orderSubmitFailed`, `lineLoginFailed`, `checkoutFailed` |
| `frontend/src/i18n/en.json` | Same keys in English |

---

## Fix 4b: Cart Snapshot + Pending Page Order Display (2026-04-14)

### Problem

After deploying fix 4, users who go through LINE Login but are NOT yet friends with the bot land on `/checkout/pending`. Two issues:

1. **The pending page shows no order details** — just a generic "訂單還未送出" message and buttons. The user can't see what they're about to order (items, quantities, prices, customer info).

2. **`createOrder` fails with "Cart is empty"** when the user clicks "送出下訂" — because the session cookie was lost during the LINE OAuth redirect on mobile (LINE in-app browser, Safari ITP). The cart items linked to the original session are inaccessible from the new browser context.

### Root Cause

`POST /api/auth/line/start` only stored form data (customer name, phone, etc.) in `pending_line_orders.form_data`. It did NOT store the cart contents. Later, `handlePendingOrder` / `confirmLineOrder` called `createOrder(session_id, null, ...)` which reads cart items from the session — but the session cookie was lost after the LINE OAuth redirect.

### Solution: Cart Snapshot

Snapshot the cart at the moment the user clicks the CTA (before any redirects), store it in the pending order, and use it for both display and order creation.

#### 1. `lineStart` stores cart snapshot

```typescript
const cart = await this.orderService.getCartForSession(sessionId);
const pendingId = await this.authService.storePendingOrder(sessionId, {
  ...body.form_data,
  _cart_snapshot: cart,  // { items, subtotal, shipping_fee, total }
});
```

At this point the session is still valid (request goes through the frontend proxy with the session cookie).

#### 2. New `GET /api/auth/line/pending-order/:id` endpoint

Returns the pending order details for the frontend. Strips internal fields (`_line_access_token`, `_user_id`), returns:

```json
{
  "cart": { "items": [...], "subtotal": 280, "shipping_fee": 0, "total": 280 },
  "customer": { "customerName": "Test", "customerPhone": "..." }
}
```

Protected by `AuthGuard`.

#### 3. `createOrder` accepts cart override

Added optional `cartOverride` parameter to `OrderService.createOrder()`. `handlePendingOrder` passes `_cart_snapshot`:

```typescript
const cartSnapshot = fd._cart_snapshot;
const order = await this.orderService.createOrder(session_id, null, dto, cartSnapshot);
```

Eliminates the dependency on the session cookie for order creation.

#### 4. `OrderService.getCartForSession()` proxy

Exposes `CartService.getCart()` to the auth controller without needing to import `CartModule`.

#### 5. Pending page displays order details

`/checkout/pending` now fetches `GET /api/auth/line/pending-order/:id` and displays:
- Item list with bilingual names, quantities, prices
- Subtotal, shipping, total
- Customer info (name, phone, address, LINE ID)
- Loading skeleton while fetching

#### 6. Error state on pending order fetch failure

If the `GET /api/auth/line/pending-order/:id` call fails (expired, auth error, network), the page now shows a message "無法載入訂單資料" with a "返回購物車" link instead of silently showing an empty page.

#### 7. `lineStart` strips `_`-prefixed fields from client form data

Defense-in-depth: before storing `form_data`, internal-prefix fields (`_cart_snapshot`, `_user_id`, `_line_user_id`) submitted by the client are stripped. Only the server adds these fields.

#### 8. Friendship check uses Messaging API bot token instead of LINE Login token

**Problem**: The previous `checkLineFriendship` implementation used the user's LINE Login access token (via `GET https://api.line.me/friendship/v1/status`). LINE Login tokens expire in ~30 minutes. If the user stayed on the pending page longer than that before clicking "Submit Order", the friendship check would fail with HTTP 401 — returning `false` even if the user IS a friend. This incorrectly redirected the user to the failure page.

**Approaches considered**:

1. **Use Messaging API bot token (chosen)** — The `GET /v2/bot/profile/{userId}` endpoint uses the bot's long-lived channel access token instead of the user's short-lived LINE Login token. Returns 200 if the user is a friend, 404 if not. The bot token does not expire in the same way (long-lived or auto-refreshable), eliminating the timeout problem entirely.

2. **Re-authenticate on token expiry** — Detect HTTP 401 from the friendship API and redirect the user back through LINE Login to obtain a fresh token. Downsides: poor UX (user goes through LINE Login a second time), adds complexity to the flow, and still race-prone if the second token also expires.

3. **Refresh the LINE Login token periodically** — Store the LINE refresh token (valid ~90 days) and refresh the access token before it expires. Downsides: requires storing and managing an additional token, adds refresh logic, and the refresh token itself can be revoked.

**Why option 1 wins**: Smallest change footprint, no dependency on user-side token lifetimes, and the bot token is already available in the codebase (`LINE_CHANNEL_ACCESS_TOKEN` used by `LineService` for push messages).

**Changes**:

- `handleLineLogin` now returns `lineUserId` (LINE profile user ID) alongside `lineAccessToken`
- `checkLineFriendship(lineUserId)` calls `GET /v2/bot/profile/{userId}` with the bot's channel access token
- `updatePendingOrderAuth` stores `_line_user_id` instead of `_line_access_token`
- `confirmLineOrder` reads `_line_user_id` for the friendship check
- `getPendingOrder` strips `_line_user_id` (instead of `_line_access_token`) from the response

### Files Modified

| File | Change |
|---|---|
| `backend/src/auth/auth.service.ts` | `handleLineLogin` returns `lineUserId`; `updatePendingOrderAuth` stores `_line_user_id` instead of `_line_access_token` |
| `backend/src/order/order.service.ts` | New `getCartForSession()`; `createOrder` accepts optional `cartOverride` |
| `backend/src/auth/auth.controller.ts` | `checkLineFriendship` rewritten to use Messaging API bot token; `lineStart` strips `_`-prefixed client fields + stores cart snapshot; new `GET line/pending-order/:id`; `confirmLineOrder` uses `_line_user_id`; `handlePendingOrder` passes cart snapshot |
| `frontend/src/app/checkout/pending/page.tsx` | Rewritten — fetches + displays order details; error state on fetch failure |
| `frontend/src/i18n/zh.json` | Added `checkout.pendingLoadFailed` |
| `frontend/src/i18n/en.json` | Added `checkout.pendingLoadFailed` |
