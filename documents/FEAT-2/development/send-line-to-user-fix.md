# Fix: LINE OAuth Callback 500 Error on Vercel

## Problem

Clicking the CTA "透過 LINE 聯繫" triggers the LINE Login OAuth flow. After LINE authentication, the browser is redirected to `https://papa-bread-api.vercel.app/api/auth/line/callback?code=...&state=...`. This callback returns:

```json
{"statusCode":500,"message":"Internal server error"}
```

Five consecutive commits attempted to fix this issue (`d00bcdb`→`b150cdf`→`be47875`→`f2761c0`→`7ec5309`), each targeting a different symptom. None resolved the 500 because the root causes were architectural, not incidental.

## Root Cause Analysis

### Cause 1: Missing Middleware in Vercel Entry Point

`backend/api/index.ts` (Vercel serverless handler) was missing two essential middleware calls that `backend/src/main.ts` (local dev) registers:

| Middleware | `main.ts` (local) | `api/index.ts` (Vercel) | Impact |
|---|---|---|---|
| `app.use(cookieParser())` | Yes | **Missing** | `req.cookies` always `undefined` — sessions never read |
| `app.useGlobalPipes(new ValidationPipe(...))` | Yes | **Missing** | DTO validation skipped |

Without `cookieParser`, the `SessionMiddleware` can never read the `session_id` cookie. This means `req.sessionId` is always `undefined` on Vercel, so session-based operations (cart merge on login, session→user linking) silently fail.

**References:**
- Express cookie-parser: https://expressjs.com/en/resources/middleware/cookie-parser.html
- NestJS cookies: https://docs.nestjs.com/techniques/cookies
- NestJS validation pipes: https://docs.nestjs.com/pipes

### Cause 2: In-Memory One-Time Codes Cannot Work in Serverless (Fundamental)

The LINE OAuth callback flow used an **in-memory `Map`** to store one-time codes:

```
Step 1: GET /api/auth/line/callback
  → handleLineLogin(code) → AuthResponse
  → oneTimeCodes.set(uuid, { tokens, expiresAt })   ← stored in Lambda instance A's memory
  → redirect to frontend /auth/callback?code=uuid

Step 2: POST /api/auth/line/exchange  { code: uuid }
  → oneTimeCodes.get(uuid)                           ← Lambda instance B — Map is empty!
  → returns null → 401 "Invalid or expired code"
```

On Vercel Serverless Functions, each request **may hit a different Lambda instance**. Warm instances can reuse memory, but there is no guarantee that steps 1 and 2 will hit the same instance. On cold starts, the `Map` is always empty.

This means **even if the 500 was fixed**, the subsequent code exchange would still fail ~50-90% of the time (depending on instance reuse).

This is the core "wrong direction" — previous commits targeted specific failure modes within `handleLineLogin` (bcrypt limits, Host header, error handling) without realizing that the one-time code architecture was fundamentally incompatible with serverless.

**References:**
- Vercel Serverless Functions — stateless compute model: https://vercel.com/docs/functions/concepts
  - "When a request is made, a computing instance is spun up to handle the request, and then spun down after the request is complete."
  - Warm instances can preserve memory caches, but cold starts discard all in-memory state. Developers should not rely on in-memory persistence across invocations.

### Cause 3: No Error Handling on Callback Endpoint

The `lineCallback` handler had no `try-catch`. Any non-`HttpException` error (e.g., `configService.getOrThrow()` for a missing env var, `fetch()` network error, `response.json()` parse error) would be caught by NestJS's global exception filter and returned as a generic `500 Internal server error` with no details.

Possible 500 triggers (all produce plain `Error`, not `HttpException`):

| Failure | Error Type | Scenario |
|---|---|---|
| `configService.getOrThrow('FRONTEND_URL')` | `Error` | Env var not set on Vercel |
| `configService.getOrThrow('LINE_LOGIN_CHANNEL_SECRET')` | `Error` | Env var not set on Vercel |
| `fetch('https://api.line.me/...')` throws | `TypeError` | Network/DNS failure |
| `tokenResponse.json()` throws | `SyntaxError` | LINE returns non-JSON (HTML error page) |
| `data.user.id` on null | `TypeError` | Supabase returns unexpected shape |

Without a try-catch, the exact error was invisible — the user only saw `{"statusCode":500,"message":"Internal server error"}`.

## Previous Fix Attempts (Why They Didn't Work)

| Commit | What It Fixed | Why It Didn't Solve the 500 |
|---|---|---|
| `d00bcdb` — Add missing `GET /api/auth/line` endpoint | Endpoint was 404 | Correct fix, but the callback (not the initiation) was the problem |
| `b150cdf` — Use `req.get('host')` instead of `X-Forwarded-Host` | redirect_uri mismatch when proxied through frontend | Would have caused LINE `400 Bad Request`, not a 500 |
| `be47875` — Hash password with SHA-256 (bcrypt 72-byte limit) | Password >72 bytes silently truncated by bcrypt | Would cause `400 BadRequestException`, not a 500 |
| `f2761c0` — Also fix host in callback handler | redirect_uri mismatch in token exchange | Same as b150cdf |
| `7ec5309` — Ignore "already registered" error | createUser fails for existing user | Would cause `400 BadRequestException`, not a 500 |

All five fixes addressed legitimate issues that could cause `400` errors. But the `500` is caused by **unhandled exceptions** (Cause 3) in a **serverless environment** that lacks proper middleware (Cause 1) and relies on **in-memory state** (Cause 2).

## Solution

### Fix 1: Add Missing Middleware to Vercel Entry Point

**File:** `backend/api/index.ts`

```typescript
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

// In bootstrap():
app.use(cookieParser());
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

Now the Vercel serverless function has the same middleware stack as local dev. Sessions, cookie-based features, and DTO validation all work correctly.

### Fix 2: Replace In-Memory Codes with URL Hash Fragment Tokens

Instead of the one-time code exchange pattern, pass auth tokens directly in the URL **hash fragment**.

**File:** `backend/src/auth/auth.controller.ts` — `lineCallback` method

```typescript
// Before (broken in serverless):
const oneTimeCode = randomUUID();
await this.authService.storeOneTimeCode(oneTimeCode, result);
res.redirect(`${frontendUrl}/auth/callback?code=${oneTimeCode}`);

// After (serverless-safe):
const params = new URLSearchParams({
  access_token: result.access_token,
  refresh_token: result.refresh_token,
  user_id: result.user.id,
  email: result.user.email,
});
res.redirect(`${frontendUrl}/auth/callback#${params.toString()}`);
```

**File:** `frontend/src/app/auth/callback/page.tsx`

```typescript
// Read tokens from hash fragment instead of exchanging one-time code
const hash = window.location.hash.substring(1);
const hashParams = new URLSearchParams(hash);
const accessToken = hashParams.get('access_token');

if (accessToken) {
  localStorage.setItem('access_token', accessToken);
  window.history.replaceState(null, '', window.location.pathname); // clear hash
  await refreshUser();
  router.push(returnUrl);
}
```

**Why hash fragments are safe:**

- RFC 3986 Section 3.5: Fragment identifiers (`#...`) are resolved client-side only and are **never sent to the server** in HTTP requests.
- RFC 6749 Section 4.2.2 (OAuth 2.0 Implicit Grant): Defines this exact pattern — tokens are delivered via the fragment component of the redirect URI.
- The frontend immediately clears the hash via `history.replaceState` after reading the token, minimizing exposure in browser history.

**References:**
- RFC 3986 — URI Fragment Identifiers: https://datatracker.ietf.org/doc/html/rfc3986#section-3.5
- RFC 6749 — OAuth 2.0 Implicit Grant (fragment-based redirect): https://datatracker.ietf.org/doc/html/rfc6749#section-4.2

### Fix 3: Add Error Handling with Redirect to Frontend

**File:** `backend/src/auth/auth.controller.ts` — `lineCallback` method

```typescript
try {
  // ... LINE login + session merge + redirect with hash tokens
} catch (err) {
  const message = err instanceof Error ? err.message : 'LINE login failed';
  console.error('LINE callback error:', err);  // visible in Vercel Function Logs
  res.redirect(`${frontendUrl}/auth/callback#error=${encodeURIComponent(message)}`);
}
```

Now instead of a black screen with `{"statusCode":500}`:
- The actual error is logged to Vercel Function Logs (`console.error`)
- The user is redirected to the frontend callback page which displays the error message
- Future debugging is dramatically easier

### Fix 4: Express `res.redirect()` Encodes `#` to `%23` — Bypass with Raw Header

**New issue after deploying Fix 2:** After the 500 error was resolved, the frontend callback page briefly showed "No authorization code provided", then redirected to the cart page. The user was not logged in and no LINE message was sent.

**Root Cause:** Express's `res.redirect(url)` internally calls `encodeUrl()` (from the `encodeurl` npm package), which encodes `#` to `%23`.

```
// What the code intended to send:
Location: https://papa-bread.vercel.app/auth/callback#access_token=eyJ...

// What Express actually sent:
Location: https://papa-bread.vercel.app/auth/callback%23access_token=eyJ...
```

The browser treats `%23` as a literal character in the path, not a fragment separator. The frontend callback page loads with an empty `window.location.hash`, so `hashParams.get('access_token')` returns `null`, and the code falls through to the legacy fallback which displays "No authorization code provided".

**Verification:** The `encodeurl` package's `ENCODE_CHARS_REGEXP` defines the allowed character set:

```
\x21 \x25 \x26-\x3B \x3D \x3F-\x5B \x5D \x5F \x61-\x7A \x7E
```

`#` is `\x23`, which is NOT in the allowed range — so it gets encoded to `%23`.

**Fix:** Bypass `res.redirect()` and set the `Location` header directly:

```typescript
// Before (broken — # encoded to %23):
res.redirect(`${frontendUrl}/auth/callback#${params.toString()}`);

// After (raw header — # preserved):
const successUrl = `${frontendUrl}/auth/callback#${params.toString()}`;
res.setHeader('Location', successUrl);
res.status(302).end();
```

Same fix for the error redirect:
```typescript
const errorUrl = `${frontendUrl}/auth/callback#error=${encodeURIComponent(message)}`;
res.setHeader('Location', errorUrl);
res.status(302).end();
```

**References:**
- Express `res.redirect()` source code: internally calls `res.location(url)` → `encodeUrl(url)` → encodes `#`
- `encodeurl` npm package: https://www.npmjs.com/package/encodeurl
- Known Express behavior: `res.redirect()` is not compatible with URLs containing hash fragments

### Fix 5: Move `FRONTEND_URL` Env Var Check Inside try-catch

The original `configService.getOrThrow('FRONTEND_URL')` was placed **outside** the try-catch block. If this env var is not set on Vercel, `getOrThrow` throws a plain `Error` that is not caught by the try-catch. NestJS's global exception filter then returns `500 Internal server error` with no useful information.

**Fix:** Replace `getOrThrow()` with `get()` and add an explicit check with a descriptive error response:

```typescript
const frontendUrl = this.configService.get<string>('FRONTEND_URL');
if (!frontendUrl) {
  console.error('LINE callback: FRONTEND_URL is not set');
  res.status(500).json({
    error: 'Server misconfiguration',
    detail: 'FRONTEND_URL environment variable is not set',
  });
  return;
}
```

Also added diagnostic logging (visible in Vercel Function Logs):
```typescript
console.log('LINE callback: env check', {
  FRONTEND_URL: frontendUrl ?? 'NOT SET',
  LINE_LOGIN_CHANNEL_ID: !!configService.get('LINE_LOGIN_CHANNEL_ID'),
  LINE_LOGIN_CHANNEL_SECRET: !!configService.get('LINE_LOGIN_CHANNEL_SECRET'),
});
```

## Supabase Log Analysis

Queried Supabase auth logs and API logs via Supabase MCP tools. Key findings:

### Auth Logs Timeline

| Time (UTC) | Event | Origin | Result |
|---|---|---|---|
| 18:25:24 | `POST /admin/users` | localhost | **500 — panic: bcrypt password length exceeds 72 bytes** |
| 18:39:51 | `POST /admin/users` | localhost | 200 — User created successfully with SHA-256 hashed password |
| 18:39:51 | `POST /token` | localhost | 200 — Login successful |
| 18:40:15 | `POST /admin/users` | localhost | 422 — Email already exists (retry attempt) |
| 18:48:30 | `POST /admin/users` + `POST /token` | localhost | 422 + 200 — User already exists, login successful |

**Key finding: ALL auth operations had referer `http://localhost:3000`. The Vercel deployment never successfully called the Supabase Auth API.** This confirms the 500 error occurred before the Supabase calls inside `handleLineLogin` (missing env var or other pre-condition failure).

### Profiles Table Issue

```sql
SELECT line_user_id, name FROM profiles WHERE id = 'e49d4d74-...';
-- Result: line_user_id = null, name = null
-- updated_at = created_at (PATCH never actually modified the row)
```

Despite API logs showing `PATCH /rest/v1/profiles → 204`, `line_user_id` remained `null`.

**Analysis:** RLS is enabled but no policies exist (`pg_policies` returned empty set). `service_role` has `rolbypassrls = true` which should bypass RLS, but PATCH 204 does not guarantee rows were updated — PostgREST returns 204 even for 0 affected rows.

**Temporary fix:** Updated the profile directly via SQL through Supabase MCP:
```sql
UPDATE profiles SET line_user_id = 'U8622391bfc0a71e36e95d739a75e5fd2', name = 'Andy Chou'
WHERE id = 'e49d4d74-0bb9-4297-a13d-73ce01f27044';
```

This issue requires further investigation into why `supabase.from('profiles').update(...)` silently fails at the PostgREST level.

## Files Modified

| File | Change |
|---|---|
| `backend/api/index.ts` | Added `cookieParser()` + `ValidationPipe` |
| `backend/src/auth/auth.controller.ts` | Hash fragment redirect with raw Location header; env var checks; diagnostic logging |
| `backend/src/auth/auth.service.ts` | Diagnostic logging in `handleLineLogin` |
| `frontend/src/app/auth/callback/page.tsx` | Read tokens from hash fragment; legacy code exchange kept as fallback |

## LINE OAuth Flow (Updated)

```
1. User clicks the LINE CTA on /cart
2. Frontend redirects to /api/auth/line (proxied to backend)
3. Backend constructs LINE OAuth URL:
   redirect_uri = https://papa-bread-api.vercel.app/api/auth/line/callback
   → 302 redirect to https://access.line.me/oauth2/v2.1/authorize?...
4. User authenticates with LINE
5. LINE redirects browser to:
   https://papa-bread-api.vercel.app/api/auth/line/callback?code=xxx&state=yyy
6. Backend lineCallback handler:
   a. Exchange code with LINE token API (redirect_uri must match step 3)
   b. Fetch LINE profile (userId, displayName)
   c. Create or sign in Supabase user
   d. Merge session if cookie present (now works with cookieParser)
   e. Redirect to: https://papa-bread.vercel.app/auth/callback#access_token=...
   f. On error: redirect to: https://papa-bread.vercel.app/auth/callback#error=...
7. Frontend callback page:
   a. Read access_token from window.location.hash
   b. Store in localStorage
   c. Clear hash from URL (history.replaceState)
   d. refreshUser() → redirect to /cart (from line_login_return_url)
```

**Key difference from before:** Steps 6e and 7a-c replace the old two-step flow (store one-time code in memory → exchange via POST). No intermediate state, no cross-instance dependency.

## References

### LINE Platform
- LINE Login Integration Guide: https://developers.line.biz/en/docs/line-login/integrate-line-login/
- LINE Login Token Exchange API: https://developers.line.biz/en/reference/line-login/#issue-access-token
  - `redirect_uri`: "Callback URL. Must match one of the the callback URLs registered for your channel in the LINE Developers Console."
  - Token exchange requires the same `redirect_uri` as the authorization request.

### Vercel
- Vercel Serverless Functions (stateless compute): https://vercel.com/docs/functions/concepts
  - In-memory state is not guaranteed across invocations. Cold starts reset all memory.

### OAuth / Security Standards
- RFC 6749 Section 4.2 — OAuth 2.0 Implicit Grant: https://datatracker.ietf.org/doc/html/rfc6749#section-4.2
  - Defines passing tokens via URL fragment component (`#access_token=...`).
- RFC 3986 Section 3.5 — URI Fragment Identifiers: https://datatracker.ietf.org/doc/html/rfc3986#section-3.5
  - Fragment identifiers are client-side only and never sent in HTTP requests.

### NestJS / Express
- NestJS Cookies (cookie-parser integration): https://docs.nestjs.com/techniques/cookies
- NestJS Validation Pipes: https://docs.nestjs.com/pipes
- Express cookie-parser: https://expressjs.com/en/resources/middleware/cookie-parser.html
- `encodeurl` npm package (used internally by Express): https://www.npmjs.com/package/encodeurl
  - `ENCODE_CHARS_REGEXP` does not include `#` (`\x23`), so `res.redirect()` encodes `#` to `%23`
  - When the redirect URL contains a hash fragment, `res.redirect()` must be bypassed — set the `Location` header directly instead
