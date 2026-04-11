# LINE "Add Friend First" Error Handling

## Problem

When the shop admin's LINE account (`LINE_ADMIN_USER_ID`) has not added the Messaging API bot as a friend, the `pushMessage` call to the LINE Messaging API returns HTTP 400. Previously, this was caught as a generic error — the user only saw "LINE 傳送失敗，請稍後再試" with no actionable guidance.

The LINE Messaging API requires the recipient to have added the Official Account (bot) as a friend before push messages can be delivered. This is a common setup issue during initial deployment.

## Root Cause

The LINE Messaging API `pushMessage` endpoint rejects requests with HTTP 400 when the target user ID belongs to someone who has not befriended the bot. The `@line/bot-sdk` throws this as an error with `statusCode: 400`.

Flow before fix:
1. `POST /api/orders/:id/line-send` calls `lineService.sendOrderToAdmin(orderId)`
2. `sendOrderToAdmin` calls `messagingClient.pushMessage({ to: adminUserId, ... })`
3. LINE API returns 400 → SDK throws error
4. Controller catches error, returns `{ success: false, message: "..." }`
5. Frontend shows a generic "LINE send failed" toast — user has no idea what to do

## Fix

### Backend — `line.controller.ts`

- Inject `ConfigService` to read `LINE_OA_ID` (defaults to `@papabakery`).
- In the catch block, detect `error.statusCode === 400` specifically.
- Return a structured response with `needs_friend: true` and `add_friend_url` pointing to `https://line.me/R/ti/p/{LINE_OA_ID}`.

```typescript
if (error?.statusCode === 400) {
  return {
    success: false,
    needs_friend: true,
    add_friend_url: `https://line.me/R/ti/p/${lineOaId}`,
    message: 'Please add our LINE Official Account as a friend first.',
  };
}
```

### Frontend — `cart/page.tsx`

- Check `lineData.needs_friend` in the error handling branch.
- Show a specific toast: "請先加入我們的 LINE 官方帳號為好友，再重新送出".
- Automatically open the add-friend URL in a new tab via `window.open(lineData.add_friend_url, '_blank')`.
- Stay on `/cart` with cart items intact — user can retry after adding the bot as friend.

## How to get `LINE_ADMIN_USER_ID`

1. Go to [LINE Developers Console](https://developers.line.biz/console/)
2. Select your Provider → select the **Messaging API channel** (Channel ID: `2008443478`)
3. Navigate to the **Basic settings** tab
4. Copy the value from the **"Your user ID"** field (format: `U` followed by 32 hex characters)
5. Set it in `backend/.env` as `LINE_ADMIN_USER_ID=Uxxxxxxxx...`

The account corresponding to this user ID **must** add the LINE Official Account as a friend for push messages to work.

## References

- [Get user IDs | LINE Developers](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/) — How to find your own user ID in the LINE Developers Console
- [Send messages | LINE Developers](https://developers.line.biz/en/docs/messaging-api/sending-messages/) — Push message requirements and limitations
- [Get started with the Messaging API | LINE Developers](https://developers.line.biz/en/docs/messaging-api/getting-started/) — Initial setup including bot friend requirements
