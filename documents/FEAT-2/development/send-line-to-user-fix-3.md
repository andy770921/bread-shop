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
