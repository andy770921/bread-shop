# Fix 3: Server-Side Order Creation — Eliminate localStorage Dependency

## Problem

After all previous fixes, the LINE Login flow still fails for users in LINE's in-app browser:

1. User fills cart + form + LINE ID → clicks CTA
2. Sees "Authenticating..." → does NOT see "Creating your order..."
3. Redirected to **homepage** (not /cart, not success page)
4. Cart is empty, no order created

## Root Cause: localStorage Lost Across LINE OAuth Redirect on Mobile

The callback page reads `localStorage.getItem('cart_form_data')` — but it returns `null`.

The form data was saved to localStorage on the cart page before the redirect. But when the callback page loads after LINE OAuth, localStorage is empty.

**Why:** The user is in LINE's in-app browser (WKWebView on iOS). During LINE OAuth:

```
WebView A (LINE in-app browser)
  papa-bread.vercel.app/cart
    → localStorage.setItem('cart_form_data', '...')  ← SAVED HERE
    → window.location.href = '/api/auth/line'
    → 302 → access.line.me/oauth2/v2.1/authorize
    → LINE app takes over for authentication

WebView B (possibly NEW instance after LINE app authentication)
  papa-bread.vercel.app/auth/callback#access_token=...
    → localStorage.getItem('cart_form_data')  ← null (different WebView!)
```

This happens because:
1. **iOS Intelligent Tracking Prevention (ITP):** Cross-domain redirect chains (`vercel.app` → `line.me` → `vercel.app`) can trigger storage partitioning or clearing
2. **LINE LIFF integration:** The `liffClientId` and `liffRedirectUri` parameters in the callback URL confirm LIFF is involved, which may open a different WebView instance
3. **LINE app authentication handoff:** When LINE Login triggers the LINE app for authentication, the callback may return in a different browser context

This affects `localStorage`, `sessionStorage`, and potentially cookies. Client-side storage is fundamentally unreliable for data that must survive a mobile OAuth redirect through a third-party app.

## Solution: Move Form Data to Server Side

Instead of storing form data in the browser and hoping it survives the redirect, store it in Supabase before the redirect and retrieve it server-side during the callback.

### New Flow

```
1. User clicks "透過 LINE 聯繫" CTA on /cart
2. Frontend: POST /api/auth/line/start { formData, sessionId? }
   → Backend stores in Supabase `pending_line_orders` table
   → Returns { pendingId: uuid }
3. Frontend: window.location.href = '/api/auth/line?pending=<pendingId>'
4. Backend: GET /api/auth/line
   → Encodes pendingId in OAuth state (signed JWT)
   → Redirects to LINE OAuth
5. User authenticates with LINE
6. LINE redirects to: GET /api/auth/line/callback?code=xxx&state=<jwt>
7. Backend callback:
   a. Decode state JWT → extract pendingId
   b. Retrieve form data from pending_line_orders
   c. Exchange LINE code → create/sign-in user (handleLineLogin)
   d. Create order using stored form data + session_id
   e. Send LINE message (best-effort)
   f. Confirm order (clear cart)
   g. Delete pending record
   h. Redirect to: papa-bread.vercel.app/checkout/success?order=ORD-xxx
8. Frontend: success page displays order
   OR on error: redirect to papa-bread.vercel.app/cart?error=<message>
```

**Key change:** Order creation happens entirely server-side in the backend callback handler. The frontend callback page is no longer needed for order logic — the backend redirects directly to the success page.

### Why This Works

- **No client-side storage dependency:** Form data is in Supabase, not localStorage
- **State travels via URL:** The `pendingId` is encoded in the OAuth state parameter, which travels through LINE's redirect chain as a URL query parameter
- **Server-side order creation:** The backend has everything it needs (form data, LINE auth, session ID) to create the order without any frontend involvement
- **Serverless-safe:** Supabase table persists across Lambda invocations (unlike in-memory state)

## Implementation

### Database: `pending_line_orders` Table

```sql
CREATE TABLE pending_line_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  form_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Auto-cleanup expired records
CREATE INDEX idx_pending_line_orders_expires ON pending_line_orders (expires_at);
```

### Backend Changes

| File | Change |
|---|---|
| `auth.controller.ts` | New `POST /api/auth/line/start` endpoint; modified `GET /api/auth/line` to accept `?pending=`; callback creates order server-side |
| `auth.service.ts` | New `storePendingOrder` / `consumePendingOrder` methods |
| `auth.module.ts` | Import `OrderModule` and `LineModule` for server-side order creation |

### Frontend Changes

| File | Change |
|---|---|
| `cart/page.tsx` | Replace localStorage save + redirect with `POST /api/auth/line/start` then redirect |
| `auth/callback/page.tsx` | Simplified — only handles non-cart LINE Login; cart flow bypasses this page entirely |

## Files Modified

| File | Change |
|---|---|
| Supabase migration | `pending_line_orders` table |
| `backend/src/auth/auth.controller.ts` | New `/start` endpoint; `pending` param in `/line`; server-side order in callback |
| `backend/src/auth/auth.service.ts` | `storePendingOrder`, `consumePendingOrder` methods |
| `backend/src/auth/auth.module.ts` | Import OrderModule, LineModule |
| `frontend/src/app/cart/page.tsx` | Call `/start` API instead of localStorage |
| `frontend/src/app/auth/callback/page.tsx` | Simplified — no order creation logic |

## Fix 3a: Diagnostic Logging + Session Merge + consumePendingOrder Robustness

### Problem (2026-04-13)

After deploying fix-3, the flow still fails silently:

1. `POST /api/auth/line/start` returns 201 (pending order stored in Supabase — confirmed record exists)
2. LINE OAuth succeeds (token exchange 200, profile obtained)
3. `GET /api/auth/line/callback` returns 302 — but redirects to `/auth/callback#tokens` instead of `/checkout/success`
4. User sees "Authenticating..." then is redirected to homepage with empty cart
5. No order created, no LINE message sent, no error shown

**Database evidence:** The `pending_line_orders` record was never consumed (still present, not deleted). The record was valid at callback time (`expires_at > callback_time` confirmed via SQL).

### Root Cause Analysis

**Two bugs combined:**

**Bug 1: `consumePendingOrder` swallows errors silently**

The original code only destructured `{ data }` and ignored `{ error }`:

```typescript
const { data } = await supabase.from('pending_line_orders')...single();
if (!data) return null; // error is lost — no logging
```

When `.single()` finds 0 matching rows (or encounters any PostgREST error), it returns `{ data: null, error: PostgrestError }`. The method returned `null` without logging — the callback assumed "no pending order" and fell through to the token redirect.

The exact cause of the query failure is unknown (no logs), but candidates include:
- PostgREST/RLS interaction (similar to the `profiles` silent failure in fix-2)
- Clock skew on `expires_at` filter
- Transient Supabase connectivity issue

**Bug 2: Session never merged for the pending order flow**

The callback's session merge used `req.sessionId`:
```typescript
if (req.sessionId) {
  await this.authService.mergeSessionOnLogin(req.sessionId, result.user.id);
}
```

But the callback is a **direct request to the backend domain** (`papa-bread-api.vercel.app`), not proxied through the frontend. The `session_id` HttpOnly cookie was set on the frontend domain (`papa-bread.vercel.app`) — it is NOT sent to the backend domain. So `req.sessionId` is `undefined`, and `mergeSessionOnLogin` is skipped.

The guest's cart items remain orphaned under the original session, never linked to the new LINE user. After the flow completes, the frontend shows an empty cart because the logged-in user has no sessions linked to them.

### Fix

**`auth.service.ts` — `consumePendingOrder`:**
- Destructure `{ data, error }` and log errors
- Fallback: if the primary query (with `expires_at` filter) fails, retry without the filter to handle clock skew
- Log the fallback result for diagnosis

**`auth.controller.ts` — `lineCallback`:**
- Added diagnostic logging: raw `state`, decoded `pendingId`, HMAC match result, consume result
- For pending order flow: call `mergeSessionOnLogin(pending.session_id, ...)` **before** `handlePendingOrder` — this uses the session_id from the database (stored by `/line/start`), not from the cookie
- Moved the non-pending `mergeSessionOnLogin(req.sessionId, ...)` to only run when there is no pending order

**Expected logs after fix (success case):**
```
lineCallback: raw state = <uuid>.<hmac>
lineCallback: state decode — id = <uuid> , sig match = true
consumePendingOrder: id = <uuid> , now = <iso>
lineCallback: consumePendingOrder result = found
handleLineLogin: token exchange ...
handleLineLogin: token response 200 OK
handleLineLogin: profile userId = U...
```

**Expected logs if it fails again (diagnosis):**
```
lineCallback: raw state = <value>            ← reveals if state is malformed
lineCallback: state has no dot — ...          ← or: sig match = false
consumePendingOrder: query error: PGRST116 ... ← reveals exact PostgREST error
consumePendingOrder: found via fallback ...    ← or: fallback also failed
```

### Files Modified

| File | Change |
|---|---|
| `backend/src/auth/auth.controller.ts` | Diagnostic logging for state/pendingId; session merge uses `pending.session_id`; reordered merge logic |
| `backend/src/auth/auth.service.ts` | `consumePendingOrder` logs errors, adds fallback query without `expires_at` |

### Testing

1. Deploy and run the same flow: new user → add items → fill form → click LINE CTA
2. Check Vercel function logs for the new diagnostic output
3. If order creation succeeds: user should land on `/checkout/success` with LINE message sent
4. If it fails again: logs will pinpoint whether it's state decoding or Supabase query
