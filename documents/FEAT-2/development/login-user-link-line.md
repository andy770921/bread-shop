# Implementation: Account Linking — Link LINE to Existing Bread Shop Account

See `documents/FEAT-2/plans/login-user-link-line.md` for the full plan and design rationale.

## Overview

When a logged-in Bread Shop user clicks the LINE CTA, pass their user ID through the OAuth state parameter (as a signed JWT). On callback, link the LINE account to their existing profile instead of creating a new account.

## Step 1: Install JWT Library

The backend already uses Supabase Auth (which uses JWTs internally), but we need a library to sign/verify our own short-lived JWTs for the OAuth state parameter.

```bash
cd backend && npm install jsonwebtoken && npm install -D @types/jsonwebtoken
```

`jsonwebtoken` is lightweight (~30KB) and widely used. The alternative (using Node.js `crypto` to create HMAC-signed tokens manually) avoids a dependency but is more error-prone.

## Step 2: Backend — Encode User ID in OAuth State

**File:** `backend/src/auth/auth.controller.ts` — `lineLogin` method

Currently the state is a random UUID:
```typescript
const state = randomUUID();
```

Change to: if the request has a valid Bearer token AND `?link=true`, encode the user ID into the state.

```typescript
import jwt from 'jsonwebtoken';

@Get('line')
async lineLogin(
  @Query('link') link: string,
  @Req() req: Request,
  @Res() res: Response,
) {
  const channelId = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_ID');
  const channelSecret = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_SECRET');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/line/callback`);

  let state: string;

  if (link === 'true') {
    // Attempt to read the current user from the Bearer token
    const authHeader = req.headers.authorization;
    let currentUserId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const supabase = this.supabaseService.getClient();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) currentUserId = user.id;
    }

    if (currentUserId) {
      // Encode userId in state as a signed JWT
      state = jwt.sign(
        { userId: currentUserId, nonce: randomUUID() },
        channelSecret,
        { expiresIn: '5m' },
      );
    } else {
      // Token invalid/expired — fall back to normal flow
      state = randomUUID();
    }
  } else {
    state = randomUUID();
  }

  const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}&scope=profile%20openid`;
  res.redirect(lineAuthUrl);
}
```

**Note:** The state JWT is signed with `LINE_LOGIN_CHANNEL_SECRET`, making it unforgeable. It has a 5-minute TTL.

## Step 3: Backend — Decode State and Link Account on Callback

**File:** `backend/src/auth/auth.controller.ts` — `lineCallback` method

Add state decoding before `handleLineLogin`:

```typescript
@Get('line/callback')
async lineCallback(
  @Query('code') code: string,
  @Query('state') state: string,
  @Req() req: Request,
  @Res() res: Response,
) {
  const frontendUrl = this.configService.get<string>('FRONTEND_URL');
  // ... env check ...

  try {
    const channelSecret = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_SECRET');

    // Decode state — check if this is an account linking flow
    let linkToUserId: string | undefined;
    try {
      const payload = jwt.verify(state, channelSecret) as { userId: string };
      if (payload.userId) {
        linkToUserId = payload.userId;
      }
    } catch {
      // Not a JWT state (normal flow) or expired — proceed without linking
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const backendOrigin = `${protocol}://${host}`;

    const result = await this.authService.handleLineLogin(code, backendOrigin, linkToUserId);

    // ... session merge, redirect with hash tokens ...
  } catch (err) {
    // ... error redirect ...
  }
}
```

## Step 4: Backend — handleLineLogin with Account Linking

**File:** `backend/src/auth/auth.service.ts` — `handleLineLogin` method

Add a `linkToUserId` parameter. When provided, link the LINE profile to the existing user instead of creating a new account.

```typescript
async handleLineLogin(
  code: string,
  backendOrigin: string,
  linkToUserId?: string,
): Promise<AuthResponse> {
  const channelId = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_ID');
  const channelSecret = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_SECRET');

  // Exchange code for LINE tokens (unchanged)
  const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', { ... });
  const lineTokens = await tokenResponse.json();
  if (lineTokens.error) throw new BadRequestException(...);

  // Fetch LINE profile (unchanged)
  const profileResponse = await fetch('https://api.line.me/v2/profile', { ... });
  const lineProfile = await profileResponse.json();

  const supabase = this.supabaseService.getClient();

  // Check if this LINE userId is already linked to ANY account
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('line_user_id', lineProfile.userId)
    .single();

  // --- ACCOUNT LINKING FLOW ---
  if (linkToUserId) {
    if (existingProfile && existingProfile.id !== linkToUserId) {
      // LINE account already linked to a DIFFERENT user
      throw new BadRequestException('This LINE account is already linked to another user');
    }

    if (!existingProfile || existingProfile.id === linkToUserId) {
      // Link LINE to the existing Bread Shop account
      await supabase
        .from('profiles')
        .update({
          line_user_id: lineProfile.userId,
          name: lineProfile.displayName, // optionally update name
        })
        .eq('id', linkToUserId);
    }

    // Sign in as the ORIGINAL user (not a new line_xxx account)
    // Use admin API to get a session for the existing user
    const { data: userData } = await supabase.auth.admin.getUserById(linkToUserId);
    if (!userData.user) throw new BadRequestException('Original user not found');

    // Generate a new session for the original user
    // We need to sign in — but the original user might use email/password.
    // Use admin.generateLink or a workaround:
    const { data: session, error: sessionError } =
      await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: userData.user.email!,
      });

    // Alternative approach: if the above doesn't return a session directly,
    // use the admin API to create a session token.
    // This depends on Supabase version — see Implementation Notes below.

    return {
      user: { id: userData.user.id, email: userData.user.email! },
      access_token: '...', // see Implementation Notes
      refresh_token: '...',
    };
  }

  // --- EXISTING FLOW (no linking) ---
  // ... existing code for creating/signing in line_xxx@line.local account ...
}
```

### Implementation Notes: Generating a Session for the Original User

The challenge: after LINE OAuth, we need to return an `access_token` for the **original** Bread Shop user (e.g., `test@papabakery.com`), not for a new `line_xxx@line.local` user.

Supabase Auth doesn't have a direct "create session for user by ID" admin API. Options:

**Option A: Use `signInWithPassword` with the original user's credentials**
- Problem: We don't have the user's password.

**Option B: Use Supabase Admin API to generate a link and extract the token**
```typescript
const { data } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: userData.user.email!,
});
// data.properties.hashed_token can be used to verify and create a session
```
- Requires additional token exchange logic.

**Option C: Set a known password for linking, then sign in**
- Not recommended — security risk.

**Option D: Use Supabase's `admin.updateUserById` to set a temporary token**
- Not directly supported.

**Recommended: Option B** with the `generateLink` API. The magic link contains a token that can be used to create a session. This is the cleanest approach that doesn't require knowing the user's password.

Alternative: Store the original user's `access_token` in localStorage before the redirect (the frontend already has it). Pass it back to the callback page, and use it directly for order creation without re-authenticating. This avoids the server-side session generation problem entirely.

**Simplest approach (frontend-side):**
```
1. Frontend saves current access_token to localStorage('pre_line_login_token')
2. After LINE Login callback, if linking flow:
   a. Use the pre_line_login_token for order creation (the original user's token)
   b. Call a new endpoint: POST /api/auth/line/link { line_code, redirect_uri }
      → Backend exchanges LINE code, updates profile with line_user_id
      → Returns the original user's profile (with line_user_id now set)
   c. refreshUser() with the original token
```

This avoids the problem of generating a new session for the original user entirely.

## Step 5: Frontend — Pass `?link=true` and Preserve Original Token

**File:** `frontend/src/app/cart/page.tsx` — `onSubmit` handler

```typescript
// LINE transfer requires LINE Login
if (isLine && !hasLineUserId) {
  localStorage.setItem('cart_form_data', JSON.stringify(values));
  localStorage.setItem('line_login_return_url', '/cart');

  if (user) {
    // Logged-in user — save current token for account linking
    const currentToken = localStorage.getItem('access_token');
    if (currentToken) {
      localStorage.setItem('pre_line_login_token', currentToken);
    }
    window.location.href = '/api/auth/line?link=true';
  } else {
    window.location.href = '/api/auth/line';
  }
  return;
}
```

## Step 6: Frontend — Callback Handles Linking Flow

**File:** `frontend/src/app/auth/callback/page.tsx` — `handleCallback`

After LINE Login succeeds, check if this was a linking flow:

```typescript
async function handleCallback(accessToken: string) {
  const preLoginToken = localStorage.getItem('pre_line_login_token');
  localStorage.removeItem('pre_line_login_token');

  if (preLoginToken) {
    // LINKING FLOW: Use the original user's token, not the LINE Login token.
    // The backend already linked line_user_id to the original profile via state JWT.
    // Use preLoginToken for order creation so the order belongs to the original account.
    localStorage.setItem('access_token', preLoginToken);
    await refreshUser(); // Refreshes with original user — now has line_user_id
    localStorage.setItem('access_token', preLoginToken); // Re-store after onError race

    const authHeaders = { Authorization: `Bearer ${preLoginToken}` };
    // ... create order using authHeaders (same as current apiFetch pattern) ...
  } else {
    // NORMAL FLOW: New user, use the LINE Login token.
    localStorage.setItem('access_token', accessToken);
    await refreshUser();
    localStorage.setItem('access_token', accessToken);

    const authHeaders = { Authorization: `Bearer ${accessToken}` };
    // ... create order using authHeaders ...
  }
}
```

## Summary of Changes

| Layer | File | Change |
|---|---|---|
| Backend | `auth.controller.ts` | `GET /api/auth/line`: accept `?link=true`, encode userId in state JWT |
| Backend | `auth.controller.ts` | `GET /api/auth/line/callback`: decode state JWT, pass `linkToUserId` |
| Backend | `auth.service.ts` | `handleLineLogin`: accept `linkToUserId`, link profile instead of creating account |
| Frontend | `cart/page.tsx` | Save `pre_line_login_token` when logged in, redirect with `?link=true` |
| Frontend | `auth/callback/page.tsx` | Use original token for linking flow, LINE token for new user flow |
| Database | — | No migration needed. Uses existing `profiles.line_user_id` column |

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| State JWT forged | Signed with `LINE_LOGIN_CHANNEL_SECRET` — unforgeable without the secret |
| State JWT expired | Falls back to new-user flow (no linking) — user gets a separate account |
| Pre-login token expired by the time callback runs | `refreshUser()` will fail → fall back to LINE token → order under LINE account |
| LINE userId already linked to different account | Return clear error message; user must unlink from the other account first |
| Two users race to link same LINE account | `profiles.line_user_id` has no unique constraint currently — add one in future |

## Future Considerations

- Add a `UNIQUE` constraint on `profiles.line_user_id` to prevent duplicate linking
- Add "Unlink LINE account" feature in user profile settings
- Merge order history if user already has orders under both accounts
- Support LINE Login from the login page (not just cart CTA)
