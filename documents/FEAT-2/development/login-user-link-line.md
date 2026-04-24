# Implementation: Link Logged-In Users to Their Existing Bread Shop Account

See `documents/FEAT-2/plans/login-user-link-line.md` for the problem statement and target behavior.

## Why The Earlier Draft Was Wrong

The older draft assumed a different architecture:

- frontend saves form data locally
- OAuth `state` carries a JWT with `userId`
- callback returns tokens for the original user
- frontend creates the order after the callback

That is no longer how the real codebase works.

Current codebase already has:

- `pending_line_orders`
- `POST /api/auth/line/start`
- HMAC-signed `pendingId` in OAuth `state`
- server-side order creation inside `GET /api/auth/line/callback`
- `/checkout/pending` for the "not friend yet" path

So the implementation must extend that existing flow rather than introduce a parallel JWT-state design.

## Final Approach

### 1. Store the original logged-in user in the pending order

File: `backend/src/auth/auth.controller.ts`

Inside `POST /api/auth/line/start`:

- read `Authorization: Bearer ...` when present
- validate it with Supabase
- if valid, store `_link_user_id` in `pending_line_orders.form_data`
- if a Bearer token is present but invalid, return `401 Login expired. Please sign in again.`

The endpoint still strips all client-supplied `_` fields before saving.

Resulting internal payload shape:

```ts
{
  customerName: '...',
  customerPhone: '...',
  customerAddress: '...',
  lineId: '...',
  _cart_snapshot: { ... },
  _link_user_id: 'existing-bread-shop-user-id' // only for logged-in users
}
```

### 2. Read `_link_user_id` during the callback

File: `backend/src/auth/auth.controller.ts`

The callback already reads the pending order before `handleLineLogin()`.

Add:

```ts
const linkToUserId =
  pending && typeof pending.form_data._link_user_id === 'string'
    ? pending.form_data._link_user_id
    : undefined;

const result = await this.authService.handleLineLogin(code, backendOrigin, linkToUserId);
```

No new OAuth-state format is needed. The existing HMAC-signed `pendingId` remains the only thing encoded in `state`.

### 3. Add a "link existing account" branch to `handleLineLogin`

File: `backend/src/auth/auth.service.ts`

`handleLineLogin()` now accepts:

```ts
handleLineLogin(code: string, backendOrigin: string, linkToUserId?: string)
```

When `linkToUserId` is set:

1. exchange the LINE auth code as usual
2. fetch the LINE profile as usual
3. load any existing profile already using that `line_user_id`
4. load the target Bread Shop profile by `linkToUserId`
5. enforce these checks:

| Check                                                   | Failure                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| LINE user already linked to a different Bread Shop user | `"This LINE account is already linked to another user."`                   |
| Bread Shop user already linked to another LINE account  | `"This Bread Shop account is already linked to a different LINE account."` |

6. if the target profile has no `line_user_id`, update it
7. only backfill `name` from LINE when the existing profile name is empty
8. return the original Bread Shop user identity with `preserveExistingSession: true`

Important:

- This branch does **not** create or sign in a `line_xxx@line.local` account
- This branch does **not** issue a new access token for the original user

### 4. Preserve the existing browser session

File: `backend/src/auth/auth.controller.ts`

Add a helper that only appends `#access_token=...` when a new session was actually created:

```ts
private withAuthHash(url: string, auth: { access_token?: string; refresh_token?: string }) {
  if (!auth.access_token) return url;
  // append hash fragment
}
```

Use this helper for:

- `/checkout/pending`
- `/checkout/success`

Effect:

| Flow                                          | Redirect contains auth hash? |
| --------------------------------------------- | ---------------------------- |
| Guest / new LINE local account                | Yes                          |
| Logged-in user linking existing account       | No                           |
| Pending confirmation submit (`confirm-order`) | No                           |

This avoids overwriting the original email/password session with a `line_xxx@line.local` session.

## Frontend Impact

### `frontend/src/app/cart/page.tsx`

No flow redesign is needed.

The cart already:

- calls `POST /api/auth/line/start`
- redirects to `/api/auth/line?pending=<id>`

The only frontend change needed here is to show the real backend error message from `line/start` when available, so an expired login does not show a vague generic toast.

## Behavior After Implementation

### Guest user

```text
cart submit
-> line/start stores pending order
-> LINE Login
-> callback creates/signs in line_xxx@line.local
-> order belongs to the LINE account
```

### Logged-in Bread Shop user without LINE linked

```text
cart submit with Bearer token
-> line/start stores pending order + _link_user_id
-> LINE Login
-> callback links profiles.line_user_id to the original Bread Shop user
-> order.user_id is set to the original Bread Shop user
-> browser keeps the original Bread Shop token
```

### Logged-in user, not yet a friend of the Messaging API bot

```text
cart submit
-> callback links LINE to the original user
-> friendship check fails
-> pending order stores _user_id + _line_user_id
-> redirect to /checkout/pending without replacing the original token
-> after user adds friend, confirm-order creates the order under the original user
```

## Documentation Gaps That Were Fixed

The previous docs missed or misrepresented these points:

1. The real code path already depends on `pending_line_orders`, not frontend-only localStorage.
2. OAuth `state` currently carries `pendingId` with HMAC integrity, not an arbitrary JWT payload.
3. The callback already creates the order server-side for the cart flow.
4. Re-issuing an original-user session is not the practical solution here; preserving the existing browser token is.
5. The Bread Shop account may already be linked to a different LINE account, and that must fail explicitly.
6. Linking should not blindly overwrite an existing profile name with the LINE display name.
7. Internal pending-order fields exposed back to the frontend must exclude `_link_user_id` as well.

## Follow-Up Hardening

Not required for this implementation, but worth tracking:

- add a DB unique constraint on `profiles.line_user_id`
- add an explicit unlink / relink management flow in profile settings
- add e2e coverage around:
  - guest LINE checkout
  - logged-in linking flow
  - "already linked elsewhere" rejection
  - pending page after friendship failure
