# FEAT-11: Admin Frontend — Refresh Token Support

## Problem

The admin frontend stores only the Supabase `access_token` (JWT) in localStorage after login. It discards the `refresh_token` returned by the backend. When the JWT expires (default 1 hour in Supabase), the admin user is silently logged out — any API call returns 401, the auth context clears the token, and the user must re-enter credentials.

This is a poor experience for admin staff who keep the dashboard open throughout the day.

## Goal

Implement transparent token refresh so that admin sessions survive beyond the JWT expiry window without requiring the user to log in again.

## Constraints

- Supabase JWT expiry is a **project-level** setting (shared by customer and admin frontends). Changing it to a longer value (e.g., 24h) on the free plan is not possible via Dashboard — the Sessions config requires Pro Plan.
- The backend already returns `refresh_token` from `POST /api/auth/login`. No new Supabase features are needed.
- The admin frontend is a Vite SPA with no server-side component — all token management is client-side via localStorage.

## Solution

### Backend

Add `POST /api/auth/refresh` — accepts a `refresh_token` in the body, calls `supabase.auth.refreshSession()`, returns new `access_token` + `refresh_token`.

### Admin Frontend

1. **Token store** — store both `admin_token` (access) and `admin_refresh_token` in localStorage. `clear()` removes both and emits `ADMIN_TOKEN_CLEAR_EVENT` on `window`.
2. **Fetcher interceptor** — when any API call returns 401, attempt to refresh the token via `POST /api/auth/refresh`. If successful, retry the original request with the new token. If refresh fails, clear tokens (forces re-login).
3. **Login flow** — store the `refresh_token` alongside `access_token` after successful login.
4. **Concurrency** — deduplicate refresh calls: if multiple requests hit 401 simultaneously, only one refresh request is made; others await the same promise.
5. **Auth context sync** — `AdminAuthContext` listens for `ADMIN_TOKEN_CLEAR_EVENT` and resets `user` to `null`, so `AdminAuthGuard` redirects to the login page when a background refresh fails.

## Out of Scope

- Customer frontend refresh token support (same pattern can be applied later)
- Changing Supabase JWT expiry settings
- Refresh token rotation hardening (Supabase handles this server-side)

## Files Changed

| File | Change |
|------|--------|
| `backend/src/auth/auth.service.ts` | Add `refreshToken()` method |
| `backend/src/auth/auth.controller.ts` | Add `POST /api/auth/refresh` endpoint |
| `backend/src/auth/dto/refresh-token.dto.ts` | New DTO with `class-validator` |
| `admin-frontend/src/lib/admin-token-store.ts` | Add `getRefresh()`/`setRefresh()`, update `clear()` |
| `admin-frontend/src/lib/admin-fetchers.ts` | Add 401 interceptor with auto-refresh + retry |
| `admin-frontend/src/lib/admin-auth-context.tsx` | Store `refresh_token` on login |
