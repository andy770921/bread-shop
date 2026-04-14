# FEAT-2 Plan: LINE Checkout Integration

## Scope

This document captures the product and architecture decisions for the FEAT-2 LINE checkout flow.
It answers:

- What the bakery needs from LINE integration
- What the LINE platform can and cannot guarantee
- Why the checkout flow must treat LINE message deliverability as a hard requirement
- Why the current design uses both LINE Login and a server-side deliverability check

Implementation details live in `documents/FEAT-2/development/send-line-to-user.md`.

## Business Requirement

For the `LINE Contact / Bank Transfer` checkout path, the order is valid only if the bakery can send a LINE message to the customer.

This is stricter than "the customer once linked a LINE account" and stricter than "the customer once added the official account."

The real business rule is:

> If the bakery cannot reach the customer through the LINE Official Account at checkout time, the order must be treated as failed.

That rule exists because the bakery relies on LINE Messaging API delivery to confirm bank-transfer instructions.

## What We Learned from the LINE Platform

### 1. A LINE ID handle is not enough

The Messaging API can't send a push message to a user's LINE ID handle such as `@john123`.
It requires LINE's internal `userId`.

Implication:

- The customer-entered `customer_line_id` is useful for manual fallback and admin reference
- It is not usable as a Messaging API recipient identifier

### 2. The internal LINE `userId` comes from platform-controlled flows

There are only practical ways for this project to get the internal `userId`:

- LINE Login OAuth
- LINE webhook events such as `follow` / `unfollow`

For FEAT-2, LINE Login is the correct choice because it fits checkout and does not require a webhook-based identity-linking workflow.

### 3. LINE Login can prompt users to add the official account

LINE supports the add-friend option during login.
The relevant mechanism is `bot_prompt=aggressive` on the LINE Login authorization URL, provided the LINE Login channel is linked to the Messaging API channel in the LINE Developers Console.

Implication:

- We should use LINE Login not only for authentication, but also to increase the chance that the user becomes reachable by the bakery's official account before order submission

### 4. "Friendship" and "deliverability" are related, but not identical implementation concepts

LINE gives different signals depending on the phase:

- During fresh LINE Login, `GET /friendship/v1/status` returns `friendFlag`
- `friendFlag=true` means the user has added the linked official account and has not blocked it
- Outside the fresh-login context, the Messaging API FAQ explicitly states there is no Messaging API endpoint whose purpose is "determine whether a user is a friend"

This distinction matters.
The product requirement is not "store a friendship flag"; the product requirement is "can the bakery deliver a LINE message right now?"

### 5. Push-message success is not a safe checkout signal

The LINE FAQ states that if you send a message to a user who blocked the official account, the API may still return HTTP `200` and no error occurs.

Implication:

- "Try to send, and if it throws then fail checkout" is not correct
- "Order created + push attempted" is also not correct
- We must check reachability before treating checkout as successful

This insight is the key reason behind the April 14, 2026 regression fix for linked users who had blocked the official account.

## Design Consequences

### Required product behavior

The checkout must branch as follows:

1. User is not logged in with LINE:
   - Start LINE Login
   - Preserve checkout intent server-side
   - Decide after login whether the user is reachable

2. User completes LINE Login and is reachable:
   - Create order
   - Send LINE messages
   - Show success page

3. User completes LINE Login but is not reachable:
   - Do not finalize checkout immediately
   - Route to a pending/failed recovery flow

4. User already has a persisted `line_user_id` but later blocks the official account:
   - Do not trust the historical link alone
   - Re-check current message eligibility before order creation
   - Treat failure as checkout failure, not as a best-effort warning

### Why the current solution has two checks

The final architecture uses two complementary mechanisms:

1. **LINE Login + add-friend prompt**
   - Solves identity (`userId`)
   - Improves reachability before order submission

2. **Server-side message-eligibility check**
   - Protects the already-linked-user path
   - Prevents success pages for users who blocked the official account after the original link

## Options Considered

### Option A: Store only customer LINE ID and let staff contact manually

Pros:

- Simple
- No OAuth complexity

Cons:

- No automated message delivery
- Fails the product goal of sending checkout communication through LINE automatically

Decision:

- Not sufficient as the main flow

### Option B: Create the order first, then attempt `pushMessage`

Pros:

- Simple implementation

Cons:

- Incorrect for blocked users because push can return `200` even when nothing is delivered
- Creates false-positive success pages
- Violates the business rule

Decision:

- Rejected

### Option C: Use only `friendship/v1/status`

Pros:

- Official friend-status signal during fresh LINE Login

Cons:

- Requires a current LINE Login access token
- Doesn't cover already-linked users returning later without a fresh login token
- Does not remove the need for a post-link reachability strategy

Decision:

- Useful conceptually, but not sufficient as the sole runtime check

### Option D: LINE Login + server-side pending order + message-eligibility gate

Pros:

- Works for guest checkout and linked users
- Protects against mobile redirect storage loss
- Prevents false success for blocked users
- Keeps checkout semantics aligned with business needs

Cons:

- More moving parts
- Requires pending-order persistence and explicit recovery states

Decision:

- Chosen

## Final Planned Experience

### Path A: Guest or non-LINE user

1. User fills cart form and chooses LINE transfer
2. Frontend stores checkout intent on the server as a pending order
3. User is redirected to LINE Login with `bot_prompt=aggressive`
4. Backend processes the callback
5. If reachable, create the order and redirect to success
6. If not reachable, redirect to the pending confirmation page or failure page depending on the flow state

### Path B: Already linked LINE user who is still reachable

1. User chooses LINE transfer
2. Frontend asks the backend whether the linked `line_user_id` can currently receive messages
3. If yes, create order and continue
4. If LINE send succeeds, confirm order and show success

### Path C: Already linked LINE user who blocked the official account

1. User chooses LINE transfer
2. Frontend asks the backend whether the linked `line_user_id` can currently receive messages
3. Backend returns `can_receive_messages=false`
4. Frontend does not create an order
5. User is routed to `/checkout/failed?reason=not_friend`

This path closes the regression where the user previously saw a success page despite being unreachable.

## Risk Assessment

### Risk 1: Historical linkage can drift from current deliverability

Example:

- User linked LINE last week
- User blocks the official account today
- `profiles.line_user_id` still exists

Mitigation:

- Never treat `line_user_id` alone as proof that checkout may proceed
- Re-check message eligibility before order creation

### Risk 2: Mobile OAuth flows may lose browser-side storage

Example:

- LINE in-app browser
- OAuth redirect crosses domains/apps
- `localStorage` is unavailable after the return

Mitigation:

- Pending order state is stored server-side, not only in browser storage

### Risk 3: Messaging API success response can be misleading

Example:

- Blocked user
- `pushMessage` returns HTTP `200`
- Message is still not delivered

Mitigation:

- Checkout correctness must not depend on push response alone

## Decision Summary

The FEAT-2 checkout flow is designed around one operational truth:

> The bakery must verify customer reachability through the LINE Official Account before an order is considered successfully placed.

That is why the final architecture combines:

- LINE Login to obtain the internal LINE `userId`
- `bot_prompt=aggressive` to prompt add-friend during login
- server-side pending-order storage for resilience
- a dedicated message-eligibility check for already-linked users
- failure routing when the customer cannot currently receive LINE messages

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

## Internal Notes Consolidated into This Plan

This document supersedes the earlier iterative research and fix notes in:

- `documents/FEAT-2/development/send-line-to-user.md`
- `documents/FEAT-2/development/send-line-to-user-fix.md`
- `documents/FEAT-2/development/send-line-to-user-fix-2.md`
- `documents/FEAT-2/development/send-line-to-user-fix-3.md`
- `documents/FEAT-2/development/send-line-to-user-fix-4.md`
