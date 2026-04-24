# Admin Frontend Refresh Token — Implementation Guide

## Background

Supabase `signInWithPassword` returns both `access_token` (short-lived JWT, default 1h) and `refresh_token` (long-lived, used to obtain new access tokens). The admin frontend was only storing the access token, meaning sessions expired silently after 1 hour.

## Architecture

```
┌─────────────────┐     401      ┌──────────────────┐
│  Admin Frontend  │ ──────────► │  Any API Request  │
│  (defaultFetchFn)│             └──────────────────┘
│                  │                     │
│  catches 401     │◄────────────────────┘
│       │          │
│       ▼          │
│  POST /api/auth/ │ ──────────► ┌──────────────────┐
│     refresh      │             │  Backend          │
│                  │             │  supabase.auth    │
│  new tokens ◄────│─────────────│  .refreshSession()│
│       │          │             └──────────────────┘
│       ▼          │
│  Retry original  │
│  request with    │
│  new access_token│
└─────────────────┘
```

## Implementation Details

### 1. Backend — `POST /api/auth/refresh`

**File:** `backend/src/auth/auth.service.ts`

```typescript
async refreshToken(refreshToken: string): Promise<AuthResponse> {
  const authClient = this.supabaseService.getAuthClient();
  const { data, error } = await authClient.auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session || !data.user) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }
  return {
    user: { id: data.user.id, email: data.user.email! },
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}
```

Key points:
- Uses `getAuthClient()` (not `getClient()`) to avoid the session contamination issue documented in CLAUDE.md.
- Returns a **new refresh token** — Supabase rotates refresh tokens on each use.
- The DTO (`RefreshTokenDto`) validates the `refresh_token` field with `class-validator`.

**File:** `backend/src/auth/auth.controller.ts`

```typescript
@Post('refresh')
async refresh(@Body() dto: RefreshTokenDto) {
  return this.authService.refreshToken(dto.refresh_token);
}
```

No auth guard — the refresh token itself is the credential.

### 2. Admin Token Store

**File:** `admin-frontend/src/lib/admin-token-store.ts`

Added `getRefresh()` and `setRefresh()` for the refresh token. `clear()` removes both tokens. Keys: `admin_token` (access) and `admin_refresh_token`.

### 3. Fetcher Interceptor (Core Logic)

**File:** `admin-frontend/src/lib/admin-fetchers.ts`

The `defaultFetchFn` wrapper now catches `ApiResponseError` with status 401 and:

1. Checks for a stored refresh token
2. Calls `POST /api/auth/refresh` with the refresh token
3. Stores the new access + refresh tokens
4. Retries the original request with the new access token

**Concurrency handling:** A module-level `refreshPromise` variable ensures that if multiple requests fail with 401 simultaneously, only one refresh call is made. All others await the same promise.

```typescript
let refreshPromise: Promise<string | null> | null = null;

// Inside the 401 handler:
if (!refreshPromise) {
  refreshPromise = refreshAccessToken().finally(() => {
    refreshPromise = null;
  });
}
const newToken = await refreshPromise;
```

If refresh fails (e.g., refresh token also expired), `adminTokenStore.clear()` is called and the original 401 error is re-thrown.

`adminTokenStore.clear()` also dispatches the `ADMIN_TOKEN_CLEAR_EVENT` window event. `AdminAuthContext` listens for this event and resets its in-memory `user` state to `null`, which lets `AdminAuthGuard` redirect to the login page. Without this signal the user would stay in a broken "logged-in but every call 401s" state — the fetcher wipes storage, but the React context has no way to know unless explicitly notified.

### 4. Login Flow Update

**File:** `admin-frontend/src/lib/admin-auth-context.tsx`

The login callback now destructures `refresh_token` from the login response and stores it:

```typescript
const { access_token, refresh_token } = await defaultFetchFn<...>('api/auth/login', ...);
adminTokenStore.set(access_token);
adminTokenStore.setRefresh(refresh_token);
```

## Token Lifecycle

1. **Login** → store `access_token` + `refresh_token` in localStorage
2. **API calls** → attach `access_token` as Bearer header
3. **401 response** → use `refresh_token` to get new tokens, retry request
4. **Refresh success** → update both tokens in localStorage, continue
5. **Refresh failure** → clear both tokens, user redirected to login page
6. **Logout** → clear both tokens explicitly

## Testing

- Log in to admin dashboard
- Wait >1 hour (or manually expire the JWT in Supabase dashboard)
- Navigate or trigger an API call — should auto-refresh without showing login page
- Clear `admin_refresh_token` from localStorage manually → next API call after JWT expiry should redirect to login

## Security Notes

- Refresh tokens are stored in localStorage (same threat model as the existing access token storage)
- Supabase rotates refresh tokens on each use (one-time use)
- The `POST /api/auth/refresh` endpoint has no auth guard — the refresh token itself serves as the credential
- If the refresh token is compromised, the attacker can obtain new access tokens until the Supabase session expires (configured as "never" in the current project settings)
