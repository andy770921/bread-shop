# Plan: Link LINE to the Existing Bread Shop Account

## Problem

The current cart LINE checkout flow already uses:

- `POST /api/auth/line/start` to store form data in `pending_line_orders`
- `GET /api/auth/line?pending=...` to redirect to LINE Login
- `GET /api/auth/line/callback` to create the order server-side

That flow works for guests, but it breaks for a logged-in email/password user who does **not** yet have `profiles.line_user_id`.

Current behavior:

| User state before CTA              | After LINE Login                  | Order `user_id` | Result                       |
| ---------------------------------- | --------------------------------- | --------------- | ---------------------------- |
| Guest                              | New `line_xxx@line.local` account | LINE account    | Expected                     |
| Logged in as `test@papabakery.com` | Switched to `line_xxx@line.local` | LINE account    | Wrong account owns the order |

The order is then invisible from `/orders` when the user logs back in with email.

## Goal

When a logged-in Bread Shop user clicks the LINE CTA from the cart:

- link the LINE profile to the **existing** Bread Shop account
- keep the order under the original Bread Shop `user_id`
- keep the guest flow unchanged

Target behavior:

| User state before CTA              | After LINE Login                   | Order `user_id`  | Result                                 |
| ---------------------------------- | ---------------------------------- | ---------------- | -------------------------------------- |
| Guest                              | New `line_xxx@line.local` account  | LINE account     | Unchanged                              |
| Logged in as `test@papabakery.com` | Same account, `line_user_id` added | Original account | Order remains visible from email login |

## Current Architecture Constraint

This feature must fit the **existing** FEAT-2 checkout architecture:

- The cart form is stored server-side in `pending_line_orders`
- The OAuth `state` currently carries a signed `pendingId`, not arbitrary JWT payload
- The backend callback may immediately create the order, or redirect to `/checkout/pending`
- The frontend no longer relies on localStorage form restore for the LINE cart flow

Because that infrastructure already exists, adding a second JWT-based state design is unnecessary and would drift from the real code path.

## Design

### Key Idea

Persist the original logged-in user ID inside the existing pending order record.

When `POST /api/auth/line/start` receives a valid Bearer token:

- validate the token
- store the original Bread Shop user ID in `pending_line_orders.form_data._link_user_id`

The callback already reads the pending order before completing LINE login, so it can use `_link_user_id` to decide whether to:

- create/sign in a `line_xxx@line.local` account, or
- link the LINE account to the original Bread Shop user

### Logged-In User Flow

```text
1. User is already logged in as test@papabakery.com
2. Cart submits LINE checkout
3. Frontend POST /api/auth/line/start with Bearer token
4. Backend validates token and stores:
   - customer form data
   - _cart_snapshot
   - _link_user_id = original Bread Shop user id
5. Frontend redirects to /api/auth/line?pending=<pendingId>
6. Backend signs pendingId into OAuth state using existing HMAC scheme
7. LINE OAuth redirects back to /api/auth/line/callback
8. Backend reads pending order, extracts _link_user_id
9. authService.handleLineLogin(..., linkToUserId) links LINE to that user
10. Backend creates the order under the original Bread Shop user
11. Success/pending redirect does not overwrite the browser's original access token
```

### Guest Flow

```text
1. Guest submits LINE checkout
2. /api/auth/line/start stores form data + cart snapshot only
3. Callback sees no _link_user_id
4. Existing behavior stays the same:
   - create/sign in line_xxx@line.local
   - create order under that LINE account
```

## Linking Rules

When `linkToUserId` is present in `handleLineLogin`:

1. Fetch the LINE profile from LINE Login as usual
2. Check whether `profiles.line_user_id = lineProfile.userId` already exists
3. Load the target Bread Shop profile (`linkToUserId`)
4. Apply the following rules:

| Scenario                                                      | Behavior                       |
| ------------------------------------------------------------- | ------------------------------ |
| LINE account already linked to another Bread Shop user        | Fail with clear error          |
| Bread Shop account already linked to a different LINE account | Fail with clear error          |
| Bread Shop account already linked to the same LINE account    | Treat as already linked        |
| Bread Shop account has no LINE link yet                       | Update `profiles.line_user_id` |

Additional rule:

- Do **not** overwrite an existing Bread Shop profile name with the LINE display name
- Only backfill `profiles.name` from LINE when the current name is empty

## Session Handling

For the link flow, the backend does **not** mint a fresh Supabase session for the original user.

Instead:

- the original Bread Shop browser session is preserved
- redirect URLs omit `#access_token=...` when no new session was created
- the frontend keeps using the original token already stored in localStorage

Why:

- Supabase does not provide a simple, clean "issue session for arbitrary existing user" API for this use case
- the cart LINE flow already runs in the same browser context that initiated the checkout
- preserving the existing token is the smallest change that matches the current app architecture

## Data / Schema Impact

No migration is required for this feature.

Existing schema already supports it:

- `profiles.line_user_id`
- `pending_line_orders.form_data`
- `orders.user_id`

Internal pending-order fields used by this flow:

- `_cart_snapshot`
- `_link_user_id`
- `_user_id`
- `_line_user_id`

## Files To Change

| File                                  | Change                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `backend/src/auth/auth.controller.ts` | Store `_link_user_id` during `line/start`; read it in callback; omit auth hash for link flow |
| `backend/src/auth/auth.service.ts`    | Add `linkToUserId?: string` branch in `handleLineLogin`                                      |
| `frontend/src/app/cart/page.tsx`      | Surface backend error messages from `line/start`                                             |

## Risks / Residual Gaps

| Risk                                                              | Notes                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `profiles.line_user_id` still has no DB uniqueness constraint     | Code checks prevent most collisions, but DB constraint would harden it                            |
| Existing browser token is assumed to survive the OAuth round-trip | This matches normal app login persistence, but is still a browser-level dependency                |
| Account merging remains unsupported                               | If someone already has orders under both email and `line_xxx@line.local`, histories stay separate |

## Out Of Scope

- Unlink LINE from an account
- Merge two existing user histories
- Rework the login-page LINE flow
- Add a new OAuth state table or JWT state format just for this feature
