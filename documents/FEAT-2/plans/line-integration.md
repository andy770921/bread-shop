# LINE Integration Research & Findings

## 1. Core Limitation: LINE ID vs LINE userId

The LINE Messaging API **cannot** send push messages using a LINE ID handle (the `@john123` username that users set in their LINE app settings). It exclusively requires the internal **userId** — a 33-character string in the format `U` followed by 32 hex characters (e.g., `U8622f7b8c5d4a3e...`).

There is **no LINE API** to convert a LINE ID handle to an internal userId. LINE intentionally separates these two identifiers. The LINE ID is a vanity username for human discovery; the userId is an opaque platform identifier for API operations.

**Sources:**
- [Get user IDs — LINE Developers](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)
- [Send messages — LINE Developers](https://developers.line.biz/en/docs/messaging-api/sending-messages/)
- [LINE Community confirmation: no conversion API exists](https://www.line-community.me/en/question/5f154e95851f74ab9c191a26)

## 2. How to Obtain a User's Internal userId

There are only three ways to obtain a user's internal userId:

### A. LINE Login OAuth (Already implemented)

When a user authenticates via LINE Login, the profile endpoint (`https://api.line.me/v2/profile`) returns their `userId`. Our codebase already implements this:

- `backend/src/auth/auth.service.ts` — `handleLineLogin()` fetches `lineProfile.userId` and stores it as `profiles.line_user_id`
- Uses LINE Login Channel ID `2008445583`
- The userId is permanently stored in the `profiles` table and available via `GET /api/auth/me`

### B. Webhook Events (Not implemented)

When a user sends a message to the LINE Official Account, follows it, or joins a group, LINE sends a webhook containing their userId. This would require:

- A webhook endpoint to receive LINE platform events
- Webhook signature verification
- A way to link the webhook userId back to a website user/order

This is more complex and not currently implemented.

### C. Get Followers List API (Not applicable)

Available only for verified/premium LINE Official Accounts. Not suitable for real-time checkout flows.

## 3. Push Message Prerequisites

To send a push message to a user via the LINE Messaging API:

1. **Must have the user's internal userId** (see above)
2. **User must have added the LINE Official Account as a friend**. If not, `pushMessage` returns HTTP 400. Our code handles this in `line.controller.ts` — returns `{ success: false, needs_friend: true, add_friend_url }`.
3. **Must use the Messaging API Channel Access Token** (Channel ID `2008443478`, Bot `@737nfsrc`)

## 4. Current Implementation in Codebase

### LINE Channels

| Channel | ID | Purpose |
|---------|------|---------|
| LINE Login | 2008445583 | OAuth2 authentication, obtains userId |
| Messaging API | 2008443478 (Bot @737nfsrc) | Push messages to admin and customers |

### Message Sending Flow (`POST /api/orders/:id/line-send`)

```
1. Always: sendOrderToAdmin(orderId)
   → Push flex message to LINE_ADMIN_USER_ID
   → If 400 error: return { needs_friend: true, add_friend_url }

2. If user is logged in AND has line_user_id in profiles:
   → sendOrderMessage(orderId, profile.line_user_id)
   → Push flex message to customer
   → Best-effort (failures silently caught)

3. Return { success: true }
```

### Flex Message Template

The `buildOrderFlexMessage()` in `line.service.ts` creates a bubble-style Flex Message with:
- Header: Shop name ("周爸烘焙坊") + order number (brown/tan theme)
- Body: Item list with quantities/prices, subtotal, shipping, total
- Customer details: Name, phone, address, LINE ID (green), notes
- Footer: "We will process your order shortly!"

### Database Schema

| Table | Column | Purpose |
|-------|--------|---------|
| `profiles` | `line_user_id` (text, nullable) | Internal LINE userId from OAuth login |
| `orders` | `line_user_id` (text, nullable) | Internal LINE userId recorded when message sent |
| `orders` | `customer_line_id` (text, nullable) | User-entered LINE ID handle for admin reference |

## 5. Recommended Flow for FEAT-2

### When user selects "LINE 聯繫，銀行轉帳" on cart page:

**Scenario A: User is logged in via LINE (`user.line_user_id` exists)**
- Show green notice: "已連結 LINE 帳號，訂單確認將自動傳送至您的 LINE"
- LINE ID field becomes **optional** (for admin reference only)
- On submit: order created → admin gets flex message → customer gets automated push message

**Scenario B: User is not logged in (or logged in without LINE)**
- Show prompt: "使用 LINE 登入後，我們可以透過 LINE 自動傳送訂單確認給您"
- Show "使用 LINE 登入" button → initiates LINE OAuth → returns to /cart
- LINE ID field is **required** (admin needs it for manual contact)
- On submit: order created → admin gets flex message (includes customer LINE ID) → admin manually contacts customer via LINE

### Why This Works

LINE Login solves the "LINE ID → userId" problem by having the user authenticate directly with LINE. The OAuth flow provides the internal userId that the Messaging API requires. No lookup or conversion is needed.

The LINE ID text field serves as a fallback: when automated messaging isn't available (user didn't log in via LINE), the admin can search for the customer's LINE ID in the LINE app and contact them manually about the bank transfer.

## 6. Alternative Approaches Considered

### LINE Notification Messages API (Phone-number based)
- Sends messages using phone number instead of userId
- Available in Japan, Thailand, and **Taiwan**
- Requires LINE partner program approval and template review
- Only transactional/non-commercial content allowed
- Could use `customer_phone` already collected in orders
- **Status:** Not pursued due to partner program complexity, but viable for future

### Account Linking (Link Token flow)
- LINE provides a formal account linking flow using link tokens
- User clicks a link in LINE chat, authenticates on website, accounts linked
- Requires webhook infrastructure + account linking endpoint
- **Status:** Over-engineered for current needs; LINE Login already solves this

### Add Friend + Webhook
- Prompt user to add OA as friend via `https://line.me/R/ti/p/{OA_ID}`
- User sends a message → webhook captures userId
- Link userId back to order/session
- **Status:** Complex UX, requires webhook infra, poor for checkout flow

## 7. Environment Variables

```
# LINE Login (OAuth2)
LINE_LOGIN_CHANNEL_ID=2008445583
LINE_LOGIN_CHANNEL_SECRET=<secret>

# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=<token>
LINE_ADMIN_USER_ID=<admin-user-id>

# Optional
LINE_OA_ID=@papabakery  # defaults to @papabakery if not set
```
