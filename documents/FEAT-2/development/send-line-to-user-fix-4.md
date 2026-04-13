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
