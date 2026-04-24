# FEAT-2 Development: Send LINE Message to Customer

## Purpose

This document describes the final FEAT-2 implementation for customer-facing LINE checkout messaging.
It consolidates the earlier iterative fix notes into one implementation reference.

Use this document for:

- the final backend and frontend flow
- the runtime decision logic
- the regression fixed on April 14, 2026
- the test coverage that protects the flow now

The planning-level reasoning and platform constraints live in `documents/FEAT-2/plans/line-integration.md`.

## Final Rule Enforced by the Code

For `LINE Contact / Bank Transfer`, the application now enforces this rule:

> If the linked LINE account cannot currently receive messages from the bakery's official account, the checkout must not end on the success page.

This is stronger than checking whether a user once linked LINE.

## Why the Regression Happened

### Observed bug

A user reported this scenario:

1. Their account had already completed LINE Login in the past
2. They later blocked the bakery's official account
3. They submitted a LINE-transfer order
4. The site still showed checkout success

That behavior was wrong because the bakery could no longer deliver the required LINE message.

### Actual root cause

There were two different runtime paths:

1. **Fresh LINE-login / pending-order path**
   - Had an explicit not-friend handling flow

2. **Already-linked user path**
   - Trusted `user.line_user_id`
   - Created the order immediately
   - Called `POST /api/orders/:id/line-send`
   - Treated customer push failure as best-effort

That second path was the gap.

### Why simply "try push and fail on error" is insufficient

Official LINE FAQ states that pushing to a user who blocked the official account may still return HTTP `200`.

So this logic is unsafe:

```text
create order
push message
if no error => success
```

Because "no error" does not mean "message delivered."

## Final Architecture

## Backend responsibilities

| Area              | Responsibility                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `AuthController`  | LINE Login initiation, callback handling, pending-order flow, message-eligibility endpoint |
| `AuthService`     | LINE OAuth exchange, user linking, pending-order storage                                   |
| `LineService`     | Admin/customer push message sending and customer reachability probe                        |
| `LineController`  | Order-specific LINE send endpoint with a defensive fallback check                          |
| `CheckoutService` | Finalize pending LINE checkout and redirect to success                                     |
| `OrderService`    | Create order, assign user, confirm order, persist LINE metadata                            |

## Frontend responsibilities

| Area                        | Responsibility                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `useCheckoutFlow`           | Main checkout decision tree                                                               |
| `cart/page.tsx`             | Cart form UI, submission entrypoint, failure redirect                                     |
| `checkout/pending/page.tsx` | Recovery page for users who must add/unblock the official account before final submission |
| `checkout/failed/page.tsx`  | Explicit failure states such as `not_friend` and `login_declined`                         |

## Core Implementation Decisions

### 1. Server-side pending orders are the source of truth

Pending checkout data is stored server-side before LINE Login.
This avoids failures caused by mobile OAuth flows losing browser storage.

### 2. `bot_prompt=aggressive` is enabled on LINE Login

The LINE authorization URL includes `bot_prompt=aggressive` so the login flow can prompt the user to add the linked official account as a friend.

### 3. Reachability is checked before success is possible

The code now uses a shared backend method:

- `LineService.canPushToUser(lineUserId)`

This method calls:

- `GET https://api.line.me/v2/bot/profile/{userId}`

Operational interpretation:

- `404` or other non-success response means the account should be treated as not reachable for checkout purposes
- checkout must not proceed to success

This is intentionally named as a message-eligibility check, not a generic "friendship status" API, because LINE's own Messaging API FAQ says there is no dedicated Messaging API endpoint to determine friend status.

### 4. Linked users are re-validated at submit time

Even when `profiles.line_user_id` already exists, frontend checkout now calls:

- `GET /api/auth/line/message-eligibility`

If the backend responds with:

```json
{
  "can_receive_messages": false,
  "add_friend_url": "https://line.me/R/ti/p/@..."
}
```

the frontend does not create an order and routes the shopper to:

- `/checkout/failed?reason=not_friend`

### 5. The order-specific LINE endpoint also has a defensive fallback

`POST /api/orders/:id/line-send` now performs the same reachability check before it attempts the customer push.

This protects against future regressions if another UI path bypasses the frontend pre-check.

## Runtime Decision Tree

### Path A: User is not yet linked with LINE

```text
cart submit
→ POST /api/auth/line/start
→ GET /api/auth/line
→ LINE Login
→ GET /api/auth/line/callback
→ backend reads pending order
→ backend resolves LINE user identity
→ backend checks customer reachability
   → reachable: create order, send LINE, success
   → not reachable: redirect to /checkout/pending or /checkout/failed
```

### Path B: User is already linked and reachable

```text
cart submit
→ GET /api/auth/line/message-eligibility
→ can_receive_messages=true
→ POST /api/orders
→ POST /api/orders/:id/line-send
→ POST /api/orders/:id/confirm
→ /checkout/success
```

### Path C: User is already linked but blocked the official account

```text
cart submit
→ GET /api/auth/line/message-eligibility
→ can_receive_messages=false
→ do not create order
→ /checkout/failed?reason=not_friend
```

This is the exact regression path now covered by tests.

## Files and Final Responsibilities

### Backend

#### `backend/src/line/line.service.ts`

Final responsibilities:

- send admin order message
- send customer order message
- expose `canPushToUser()` as the shared deliverability probe

#### `backend/src/auth/auth.controller.ts`

Final responsibilities:

- `GET /api/auth/line`
- `GET /api/auth/line/callback`
- `POST /api/auth/line/start`
- `POST /api/auth/line/confirm-order`
- `GET /api/auth/line/pending-order/:id`
- `GET /api/auth/line/message-eligibility`

Important detail:

- the linked-user path no longer trusts `line_user_id` by itself

#### `backend/src/line/line.controller.ts`

Final responsibilities:

- enforce a defensive customer reachability check before customer push
- return structured failure payloads such as `needs_friend`

#### `backend/src/checkout/checkout.service.ts`

Final responsibilities:

- create the order from a pending checkout
- attach the app user
- merge the cart/session state
- send LINE notifications
- return the final success redirect URL

### Frontend

#### `frontend/src/features/checkout/use-checkout-flow.ts`

Final responsibilities:

- detect whether checkout must start LINE Login
- for linked users, call `/api/auth/line/message-eligibility` first
- block order creation if the customer cannot currently receive LINE messages

#### `frontend/src/app/cart/page.tsx`

Final responsibilities:

- collect the checkout form
- call `submitCheckout()`
- route blocked linked users to `/checkout/failed?reason=not_friend`

#### `frontend/src/app/checkout/pending/page.tsx`

Final responsibilities:

- let users recover after LINE Login when they still need to add or unblock the official account
- submit `POST /api/auth/line/confirm-order`

## Consolidated Lessons from Earlier Fix Iterations

The older internal notes exposed several important engineering lessons that remain relevant:

### 1. Serverless callbacks cannot rely on in-memory state

One-time codes stored in process memory are unsafe on serverless infrastructure.
Persistent state must live in the database or be carried in a redirect-safe form.

### 2. Mobile OAuth flows are hostile to browser-only persistence

`localStorage` and related client-only assumptions are fragile in LINE's in-app browser and cross-app redirect flows.

### 3. Success pages must reflect business success, not partial technical success

For this checkout, "order row exists" is not enough.
The business success condition is:

- order created
- bakery can reach the customer through LINE

### 4. A historical LINE link is not a current delivery guarantee

Persisted identity solves recipient addressing.
It does not prove current message reachability.

## Regression Coverage

### Existing targeted tests

- `backend/src/auth/auth.controller.spec.ts`
  - covers pending callback and message-eligibility logic
- `backend/src/checkout/checkout.service.spec.ts`
  - covers pending checkout completion
- `frontend/src/features/checkout/use-checkout-flow.spec.ts`
  - covers the linked-user pre-check and structured `needs_friend` result

### New end-to-end style regression test

Added:

- `frontend/src/app/cart/page.spec.tsx`

Scenario covered:

1. shopper is logged in and already has `line_user_id`
2. backend reports `can_receive_messages=false`
3. shopper fills the cart form and submits
4. no order is created
5. no LINE send is attempted
6. router navigates to `/checkout/failed?reason=not_friend`

This test protects the exact user-facing regression that triggered the latest fix.

## Verification Commands Used

### Frontend

```bash
npm test -- --runInBand src/features/checkout/use-checkout-flow.spec.ts
npm test -- --runInBand src/app/cart/page.spec.tsx
npx tsc --noEmit
```

### Backend

```bash
npm test -- --runInBand auth/auth.controller.spec.ts checkout/checkout.service.spec.ts
npm run build
```

## Maintenance Guidance

If a future change touches LINE checkout, review these rules before merging:

1. Never infer checkout success from `pushMessage` response alone.
2. Never treat `profiles.line_user_id` as proof of current reachability.
3. Keep the pre-order eligibility check and the order-send fallback check aligned.
4. Keep pending-order state server-side.
5. Keep failure routing explicit so the user never lands on success when the bakery cannot message them.

## Official References

- LINE Developers, "Get user IDs"
  - https://developers.line.biz/en/docs/messaging-api/getting-user-ids/
- LINE Developers, "Gain friends of your LINE Official Account"
  - https://developers.line.biz/en/docs/messaging-api/sharing-bot/
- LINE Developers, "LINE Login v2.1 API reference"
  - `Get user profile`: https://developers.line.biz/en/reference/line-login/#get-user-profile
  - `Get friendship status`: https://developers.line.biz/en/reference/line-login/#get-friendship-status
- LINE Developers FAQ, Messaging API
  - https://developers.line.biz/en/faq/tags/messaging-api/

## Consolidated Internal History

This document replaces the fragmented implementation notes from the earlier FEAT-2 iterations:

### Original `send-line-to-user.md`

Core idea:

- Introduce customer-facing LINE messaging as part of the LINE transfer checkout
- Persist `customer_line_id` for admin reference
- Start using LINE Login so the app can get the internal LINE `userId`

Problem it was trying to solve:

- The bakery needed both an automated LINE path and a manual fallback path
- At that point the project still treated "linked LINE account" as the main prerequisite and had not yet fully modeled runtime reachability failures

What the solution was:

- Add `customer_line_id`
- Use LINE Login to obtain `profiles.line_user_id`
- Push an order message to the customer when a LINE-linked account exists

Still valid or stale:

- Still valid:
  - `customer_line_id` remains useful for manual operator reference
  - LINE Login is still the correct way to obtain the internal `userId`
- Stale:
  - The old document did not yet encode the stronger business rule that checkout must fail when the official account cannot currently reach the customer

What is used now:

- The project still uses LINE Login and `customer_line_id`
- The final system now adds a server-side message-eligibility gate before success is possible

### `send-line-to-user-fix.md`

Core idea:

- Stabilize the LINE OAuth callback in production
- Make the Vercel/serverless flow actually work

Problems encountered:

- Missing middleware in the Vercel entrypoint
- In-memory one-time code exchange was incompatible with serverless execution
- Callback errors were not surfaced clearly
- Redirects using hash fragments were broken by `res.redirect()`

What the solution was:

- Add missing middleware parity
- Stop relying on in-memory one-time code state
- Move auth data through URL hash fragments
- Improve callback error handling and redirect behavior

Still valid or stale:

- Still valid:
  - The lessons about serverless statelessness, callback hardening, and redirect behavior remain important
- Stale:
  - The intermediate "one-time code" design is no longer part of the final architecture
  - The specific debugging narrative is historical rather than operational guidance

What is used now:

- Server-side pending state and the current callback flow described in this document
- Explicit callback error handling remains part of the final implementation

### `send-line-to-user-fix-2.md`

Core idea:

- Fix post-login frontend instability and profile-link persistence problems

Problems encountered:

- The frontend callback page had a `useEffect` race condition
- `profiles.line_user_id` updates could fail silently
- The user experience after login was confusing and unstable

What the solution was:

- Guard callback processing against duplicate effect runs
- Fix profile persistence and strengthen the LINE-linked account path
- Improve the callback error UX

Still valid or stale:

- Still valid:
  - The warning that profile persistence must be verified, not assumed
  - The broader lesson that auth callback flows are sensitive to race conditions
- Stale:
  - The intermediate callback-page auto-submit direction is no longer the final design
  - The exact frontend callback workaround is superseded by the server-side pending-order flow

What is used now:

- The final system avoids relying on fragile browser-side state restoration for order completion
- Profile linkage remains required, but checkout finalization is centered on server-side pending-order orchestration

### `send-line-to-user-fix-3.md`

Core idea:

- Move checkout intent and order completion logic to the server side

Problems encountered:

- Mobile OAuth flows could lose `localStorage`
- LINE in-app browser behavior made client-only persistence unreliable
- Session/cart continuity was fragile after the OAuth round trip

What the solution was:

- Introduce `pending_line_orders`
- Store checkout form data and cart snapshot on the server before redirecting to LINE Login
- Finalize order creation using server-side pending data instead of browser-only state

Still valid or stale:

- Still valid:
  - Server-side pending-order storage is a core part of the final implementation
  - The cart snapshot and server-side continuation model remain current
- Stale:
  - Some intermediate debugging sub-fixes in that document were stepping stones, not the final conceptual model

What is used now:

- Pending orders remain the source of truth
- Server-side checkout completion is still the active implementation

### `send-line-to-user-fix-4.md`

Core idea:

- Add explicit not-friend handling and a pending confirmation page

Problems encountered:

- Users could decline LINE Login or refuse the add-friend prompt
- Users who were not reachable could still fall into an inconsistent flow
- The system needed a recovery state between login and final order submission

What the solution was:

- Add `bot_prompt=aggressive`
- Add the pending confirmation page
- Add `/api/auth/line/confirm-order`
- Strengthen pending-order lifecycle rules and ownership checks

Still valid or stale:

- Still valid:
  - The pending confirmation page is still part of the final user journey
  - The pending-order hardening work remains relevant
  - The idea that not-friend must be modeled explicitly is still correct
- Stale:
  - The original document framed the solution mainly around friend handling during fresh LINE Login
  - It did not yet close the separate regression where an already-linked user later blocks the official account

What is used now:

- Everything from fix-4 that supports pending-order recovery is still active
- The final system adds one more layer on top of fix-4:
  - a linked-user pre-check through `/api/auth/line/message-eligibility`
  - a defensive fallback check in `POST /api/orders/:id/line-send`
  - a regression test ensuring blocked linked users are routed to `/checkout/failed?reason=not_friend`

## Cleanup Note

The four incremental fix documents are now historical and have been removed because their essential lessons are consolidated above and in the rest of this document.
