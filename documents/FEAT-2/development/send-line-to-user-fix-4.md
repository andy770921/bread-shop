# Fix 4: Customer Not Receiving LINE Messages — Missing `bot_prompt`

## Problem

After the full order flow works (fixes 3a–3c), LINE messaging is partially broken:

- **Admin (bakery official LINE account):** Receives the order Flex Message correctly via `sendOrderToAdmin` -> `LINE_ADMIN_USER_ID`
- **Customer:** Does NOT receive any message from the bakery's official LINE account

The admin sees order messages appearing in the official LINE account chat (周爸麥香烘焙坊), which looks like "the bot is sending messages to itself." The customer never receives a push message.

## Root Cause: User Never Prompted to Add the Messaging API Bot as Friend

LINE Messaging API's `pushMessage` can **only** send to users who have **added the bot as a friend**. This is a hard platform requirement — if the user isn't friends with the bot, the push returns HTTP 400.

The LINE Login OAuth URL was:

```
https://access.line.me/oauth2/v2.1/authorize?
  response_type=code&
  client_id=2008445583&
  redirect_uri=...&
  state=...&
  scope=profile%20openid
```

**Missing parameter: `bot_prompt`**

Without `bot_prompt`, the LINE Login flow only authenticates the user — it does NOT prompt them to add the linked Messaging API bot (@737nfsrc, channel 2008443478) as a friend. After login, the backend has the user's `line_user_id` (from the OAuth profile), but `pushMessage` to that userId fails because they aren't friends with the bot.

The error was silently caught:

```typescript
} catch (lineErr) {
  console.error('LINE message send failed (non-critical):', lineErr);
}
```

So the order was created successfully, the admin received the notification, but the customer push failed with no visible error to the user.

**Reference:** [LINE Developers — Linking a bot with LINE Login](https://developers.line.biz/en/docs/line-login/link-a-bot/)

## Prerequisites (LINE Developer Console)

For `bot_prompt` to work, the LINE Login channel must be **linked** to the Messaging API channel in the LINE developer console:

1. Go to [LINE Developer Console](https://developers.line.biz/console/)
2. Open the LINE Login channel (2008445583)
3. Go to the **Linked bot** section
4. Select the Messaging API channel (2008443478 / @737nfsrc)
5. Save

Both channels must be under the **same provider**.

## Fix

### 1. Added `bot_prompt=aggressive` to LINE Login URL

**File:** `backend/src/auth/auth.controller.ts` — `lineLogin` method

```
Before: ...&scope=profile%20openid
After:  ...&scope=profile%20openid&bot_prompt=aggressive
```

`bot_prompt=aggressive` shows a **full-screen prompt** after LINE Login asking the user to add the Messaging API bot as a friend. If the user accepts, `pushMessage` will work immediately.

Alternative values:
- `normal` — shows a smaller checkbox (default checked) to add the bot
- `aggressive` — full-screen prompt, harder to miss (chosen for checkout flow where messaging is critical)

### 2. Separated admin and customer LINE message error handling

Previously, both `sendOrderToAdmin` and `sendOrderMessage` were in a single try-catch. If the admin push succeeded but the customer push failed, the error was logged but it wasn't clear WHICH push failed.

Now they are in separate try-catch blocks with specific logging:

```
LINE admin message sent for order 23
LINE customer message sent to Ubd51c23ab44f265745505ae39de04264
```

Or on failure:

```
LINE customer message failed: [400 error details]
```

## Files Modified

| File | Change |
|---|---|
| `backend/src/auth/auth.controller.ts` | Added `bot_prompt=aggressive` to LINE OAuth URL; separated admin/customer LINE message error handling with specific logging |

## Testing

1. **New user flow:** Clear LINE Login session (or use incognito) -> click LINE CTA -> after LINE Login, user should see a **prompt to add 周爸麥香烘焙坊 as friend** -> accept -> order created -> **customer receives Flex Message in LINE**
2. **Check Vercel logs:** Should show `LINE customer message sent to U...` (not a failure)
3. **User declines friendship:** If user declines the bot prompt, order still succeeds but customer message fails gracefully — admin still receives the notification
