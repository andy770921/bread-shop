# Plan: Account Linking — Link LINE to Existing Bread Shop Account

## Problem

When a logged-in Bread Shop user (e.g., `test@papabakery.com`) clicks the LINE CTA, the current LINE Login flow creates a **separate** `line_xxx@line.local` account. The order is placed under the LINE account, not the original Bread Shop account. The user cannot find their order when logging back in with their email.

| User State Before CTA | After LINE Login | Order `user_id` | Can Find Order? |
|---|---|---|---|
| Not logged in | New `line_xxx@line.local` account created | LINE account | Only via LINE Login |
| Logged in as `test@papabakery.com` | **Switched** to `line_xxx@line.local` | LINE account | **No** — lost under email login |

## Goal

When a user is **already logged in** to Bread Shop, LINE Login should **link** the LINE account to their existing account (store `line_user_id` in their profile) instead of creating a separate account. The order should be placed under the original Bread Shop account.

| User State Before CTA | After LINE Login | Order `user_id` | Can Find Order? |
|---|---|---|---|
| Not logged in | New `line_xxx@line.local` account created | LINE account | Via LINE Login |
| Logged in as `test@papabakery.com` | **Same account**, `line_user_id` added to profile | Original account | **Yes** — via email or LINE |

## Design

### Key Insight: Pass Current User Context Through OAuth Flow

The LINE OAuth flow is a full-page redirect. The browser leaves the app, goes to LINE, and comes back. The current user's identity must survive this round-trip.

**Mechanism:** Use the OAuth `state` parameter to carry an encrypted reference to the current user session. The backend generates the state, stores the current user ID alongside it, and verifies it when the callback returns.

### Flow: Logged-In User

```
1. User logged in as test@papabakery.com (has access_token in localStorage)
2. Clicks "透過 LINE 聯繫" CTA
3. Frontend: saves form data + access_token to localStorage
4. Frontend: redirects to /api/auth/line?link=true
   (sends existing Bearer token via the frontend proxy)
5. Backend GET /api/auth/line?link=true:
   a. Reads Bearer token from Authorization header → validates → gets userId
   b. Generates state = randomUUID()
   c. Stores { state → userId } in a server-side map (or Supabase table)
   d. Redirects to LINE OAuth with this state
6. LINE OAuth → user authenticates → callback
7. Backend GET /api/auth/line/callback?code=...&state=...:
   a. Looks up state → finds stored userId (the original Bread Shop user)
   b. Exchanges code for LINE tokens → fetches LINE profile
   c. Updates profiles SET line_user_id = lineProfile.userId WHERE id = storedUserId
   d. Signs in the ORIGINAL user (not a new line_xxx account)
   e. Returns tokens for the original account (with line_user_id now set)
8. Frontend callback: receives tokens → creates order under original account
```

### Flow: Not Logged-In User (Unchanged)

```
1. User not logged in
2. Clicks CTA → redirects to /api/auth/line (no ?link=true, no Bearer token)
3. Backend: no stored userId → normal flow
4. LINE Login → creates/signs in line_xxx@line.local account
5. Callback: order created under LINE account
```

### State Storage: Serverless-Safe

The `state → userId` mapping must persist across Lambda invocations (same issue as the one-time code problem from `send-line-to-user-fix.md`). Options:

| Option | Pros | Cons |
|---|---|---|
| **Supabase table** (`oauth_states`) | Persistent, serverless-safe | Requires migration, cleanup job |
| **Encode userId in state** (signed JWT) | No storage needed | State becomes long, must verify signature |
| **Supabase table with TTL** | Self-cleaning | Slightly more complex migration |

**Recommended:** Encode the userId in the state as a signed JWT. The backend signs a short-lived JWT containing `{ userId, nonce }` using `LINE_LOGIN_CHANNEL_SECRET` as the signing key. On callback, verify the signature and extract the userId. No database storage needed, no Lambda statefulness required.

```typescript
// Generate state (in GET /api/auth/line):
const payload = { userId: currentUserId, nonce: randomUUID() };
const state = jwt.sign(payload, channelSecret, { expiresIn: '5m' });

// Verify state (in GET /api/auth/line/callback):
try {
  const { userId } = jwt.verify(state, channelSecret);
  // userId is the original Bread Shop user → link LINE to this account
} catch {
  // Invalid/expired state → treat as new user flow
}
```

### Edge Cases

| Scenario | Behavior |
|---|---|
| LINE userId already linked to a **different** Bread Shop account | Return error: "This LINE account is already linked to another user" |
| User already has `line_user_id` in profile (re-linking) | Skip — already linked, proceed to sign in |
| State JWT expired (>5 min) | Fall back to new-user flow (create `line_xxx` account) |
| State JWT tampered | Fall back to new-user flow |
| User clicks CTA when not logged in | No `?link=true`, no Bearer token → normal new-user flow |

### Database Changes

None required. The existing `profiles.line_user_id` column is sufficient. The state is encoded in the JWT, not stored in the database.

### Backend Changes

| File | Change |
|---|---|
| `auth.controller.ts` — `GET /api/auth/line` | Accept `?link=true` query param; read Bearer token; encode userId in state JWT |
| `auth.controller.ts` — `GET /api/auth/line/callback` | Decode state JWT; if userId present, link LINE to existing account instead of creating new |
| `auth.service.ts` | New method: `linkLineToUser(userId, lineUserId, displayName)` — updates profile |
| `auth.service.ts` — `handleLineLogin` | Add `linkToUserId?: string` parameter; when set, skip user creation and link instead |

### Frontend Changes

| File | Change |
|---|---|
| `cart/page.tsx` — `onSubmit` | When user is logged in (`user` exists) AND `!hasLineUserId`, redirect to `/api/auth/line?link=true` instead of `/api/auth/line`. Save current `access_token` alongside form data. |
| `auth/callback/page.tsx` | No change — the callback already handles tokens from the hash fragment and creates orders |

### Security Considerations

- **State JWT signed with `LINE_LOGIN_CHANNEL_SECRET`** — cannot be forged without knowing the secret
- **5-minute TTL** — limits replay window
- **One-time nonce** — the nonce in the JWT prevents reuse (optional: store used nonces in a Set with TTL)
- **Bearer token validation** — the backend validates the existing token before encoding the userId
- **LINE userId uniqueness check** — prevents linking one LINE account to multiple Bread Shop accounts

## Out of Scope

- **Unlinking LINE from account** — not needed for the checkout flow
- **Merging two existing accounts** — if a user already has both a Bread Shop account and a `line_xxx` account with orders, merging order history is complex and deferred
- **LINE Login from the login page** — this plan only covers the cart CTA flow
