# Fix 4: Customer Not Receiving LINE Messages + Order Failure Handling

## Problem

After the full order flow works (fixes 3a–3c):

- **Admin** receives the order Flex Message correctly (visible in the 周爸麥香烘焙坊 official account chat)
- **Customer** does NOT receive any message from the official LINE account

Additionally, there was no handling for two failure cases:
1. User **declines LINE Login** (taps "Cancel" on LINE's OAuth consent screen)
2. User **doesn't add the bot as friend** (declines the friendship prompt)

Both cases should prevent order creation and show the user a clear reason.

## Root Cause: Missing `bot_prompt` + No Friendship Verification

### Why the customer doesn't receive messages

LINE Messaging API's `pushMessage` can **only send to users who have added the bot as a friend**. Without friendship, the push returns HTTP 400.

The LINE Login OAuth URL was missing the `bot_prompt` parameter:

```
# Before — no friendship prompt
...&scope=profile%20openid

# After — full-screen friendship prompt
...&scope=profile%20openid&bot_prompt=aggressive
```

Without `bot_prompt`, users complete LINE Login (authentication) but are never asked to add the Messaging API bot (@737nfsrc) as a friend. The `sendOrderMessage` push then fails silently.

### Why there was no failure handling

- If the user declined LINE Login, the callback received `?error=access_denied` but the backend tried to process it as a normal callback, hit an exception, and redirected to `/cart?error=LINE login failed` — not a clear message.
- If the user completed LINE Login but declined the friendship, the backend had no way to know — it created the order, tried to push a message, the push failed silently, and the user got a "success" page but never received the LINE notification.

## Solution

### 1. `bot_prompt=aggressive` in LINE Login URL

Added to the OAuth authorization URL. Shows a full-screen prompt after LINE Login asking the user to add the Messaging API bot as a friend.

**Prerequisite:** The LINE Login channel (2008445583) must be linked to the Messaging API channel (2008443478) in the [LINE Developer Console](https://developers.line.biz/console/) under "Linked LINE Official Account". This was already configured.

### 2. LINE Friendship Status API Check

After LINE Login succeeds, the backend checks the friendship status using the [LINE Friendship API](https://developers.line.biz/en/reference/line-login/#get-friendship-status):

```
GET https://api.line.me/friendship/v1/status
Authorization: Bearer {LINE OAuth access token}
→ { "friendFlag": true/false }
```

This uses the LINE Login access token (obtained during OAuth token exchange), NOT the Messaging API token.

If `friendFlag` is `false`, the order is NOT created and the user is redirected to the failure page.

### 3. LINE Login Decline Handling

The callback now checks for the `error` query parameter. When a user declines LINE Login, LINE redirects with `?error=access_denied`. The backend detects this and redirects to the failure page with `reason=login_declined`.

### 4. `handleLineLogin` Returns LINE Access Token

The return type changed from `AuthResponse` to `AuthResponse & { lineAccessToken: string }`. The `lineAccessToken` is the LINE OAuth token needed for the Friendship Status API call. It is NOT stored — only used transiently in the callback.

### 5. New Frontend Page: `/checkout/failed`

A new page at `frontend/src/app/checkout/failed/page.tsx` handles two failure reasons via query parameter:

| URL | Reason | Message |
|---|---|---|
| `/checkout/failed?reason=login_declined` | User declined LINE Login | "需要透過 LINE 登入才能完成訂單..." + "返回購物車" button |
| `/checkout/failed?reason=not_friend` | User didn't add bot as friend | "需要先加入好友..." + "加入好友" button (LINE green, links to `https://line.me/R/ti/p/@737nfsrc`) + "返回購物車" button |

The page is bilingual (zh/en) using the existing i18n system.

### 6. Separated LINE Message Error Handling

Previously, admin and customer LINE pushes shared a single try-catch. Now they are separate with specific logging:

```
LINE admin message sent for order 23
LINE customer message sent to Ubd51c23ab44f265745505ae39de04264
```

Or on failure:
```
LINE customer message failed: [400 error details]
```

## Flow After Fix

```
User clicks "透過 LINE 聯繫" CTA
  │
  ├─ POST /api/auth/line/start (stores form data)
  ├─ GET /api/auth/line (redirect to LINE OAuth + bot_prompt=aggressive)
  │
  ├─ User declines LINE Login?
  │   └─ YES → /checkout/failed?reason=login_declined
  │
  ├─ LINE Login succeeds → bot friendship prompt shown
  │
  ├─ User declines friendship?
  │   └─ YES → Backend checks friendship API → friendFlag=false
  │         → /checkout/failed?reason=not_friend
  │         → User clicks "加入好友" → adds bot → goes back to cart → retries
  │
  └─ User accepts friendship → friendFlag=true
      → Order created → LINE messages sent → /checkout/success
```

## Files Modified

| File | Change |
|---|---|
| `backend/src/auth/auth.service.ts` | `handleLineLogin` returns `lineAccessToken` for friendship check |
| `backend/src/auth/auth.controller.ts` | `bot_prompt=aggressive` in LINE URL; `checkLineFriendship` method; login decline handling (`?error` param); separated admin/customer LINE error handling |
| `frontend/src/app/checkout/failed/page.tsx` | **New** — failure page with reason-specific messaging and retry buttons |
| `frontend/src/i18n/zh.json` | Added `checkout.failedTitle`, `failedLoginDeclined`, `failedNotFriend`, `addFriend`, `backToCart` |
| `frontend/src/i18n/en.json` | Same keys in English |

## Testing

1. **Happy path:** New user → CTA → LINE Login (agree) → friendship prompt (add friend) → order created → success page → customer receives LINE message
2. **Decline login:** CTA → LINE Login screen → tap cancel → `/checkout/failed?reason=login_declined` → "返回購物車" → can retry
3. **Decline friendship:** CTA → LINE Login (agree) → friendship prompt (decline) → `/checkout/failed?reason=not_friend` → "加入好友" button → adds bot → "返回購物車" → retry succeeds
4. **Existing friend:** User who already added the bot → friendship check returns true → order created normally
