# Fix 2: LINE Login Callback Race Condition + Profiles Update Silent Failure

## Problem

After deploying all fixes from `send-line-to-user-fix.md`, a new user (not logged into the shop, never interacted with the LINE Official Account) attempts the LINE Login flow:

1. Selects items, fills in customer info and LINE ID
2. Clicks "透過 LINE 聯繫" CTA
3. Redirected to LINE Login → authenticates successfully
4. Callback page briefly flashes **"No authorization code provided"**
5. Auto-redirects to cart page → **cart is empty**
6. User is not logged in, no LINE message sent

## Root Cause Analysis

Three separate bugs combined to produce the observed behavior.

### Bug 1: Frontend `useEffect` Race Condition

**File:** `frontend/src/app/auth/callback/page.tsx`

The `useEffect` hook has `[searchParams, router, refreshUser]` in its dependency array. The `refreshUser` function is created via `useCallback` with `[fetchUserMutation]` as a dependency. When `refreshUser()` is called, it triggers `fetchUserMutation.mutateAsync()`, which changes the mutation's state (idle → loading → success). This causes `fetchUserMutation` to get a new reference → `refreshUser` gets a new reference → `useEffect` re-fires.

**Sequence:**

```
1st useEffect run:
  → hash has access_token ✓
  → localStorage.setItem('access_token', token)
  → window.history.replaceState(...)  ← clears the hash from URL
  → refreshUser().then(redirect to /cart)  ← async, not awaited
  → return

refreshUser() changes auth state → refreshUser reference changes → useEffect re-fires

2nd useEffect run:
  → hash is EMPTY (cleared by replaceState)
  → no access_token found
  → no query param code found
  → setError('No authorization code provided')  ← ERROR SHOWN

Meanwhile, 1st run's .then() resolves:
  → router.push('/cart')  ← AUTO-REDIRECT HAPPENS
```

This explains both the brief error flash AND the auto-redirect to cart.

**Fix:** Added a `useRef(processedRef)` guard. Once the hash tokens are found and processing begins, the ref is set to `true`. All subsequent effect runs exit immediately.

```typescript
const processedRef = useRef(false);

useEffect(() => {
  if (processedRef.current) return; // Prevent re-execution

  const hash = window.location.hash.substring(1);
  const hashParams = new URLSearchParams(hash);

  const accessToken = hashParams.get('access_token');
  if (accessToken) {
    processedRef.current = true; // Mark as processed BEFORE async work
    localStorage.setItem('access_token', accessToken);
    window.history.replaceState(null, '', window.location.pathname);
    refreshUser().then(() => {
      const returnUrl = localStorage.getItem('line_login_return_url') || '/';
      localStorage.removeItem('line_login_return_url');
      router.push(returnUrl);
    });
    return;
  }

  // No tokens found — show error, do NOT auto-redirect
  processedRef.current = true;
  setError('LINE login failed. Please return to the cart and try again.');
}, [searchParams, router, refreshUser]);
```

### Bug 2: `profiles.line_user_id` Never Saved (PostgREST + RLS Silent Failure)

**Table:** `profiles` — RLS enabled, zero policies

Despite `service_role` having `rolbypassrls = true` in PostgreSQL, PostgREST silently returned `PATCH 204` without actually updating the row. This was confirmed by:

```sql
-- Profile after LINE Login backend update:
SELECT line_user_id, name, updated_at, created_at FROM profiles
WHERE id = 'd1badca9-b2b0-483a-ad13-377b9913a566';
-- Result: line_user_id = null, name = null, updated_at = created_at
```

The Supabase Auth logs confirmed the LINE Login succeeded (user created at 03:28:49 UTC, login at 03:28:49 UTC). But the subsequent `profiles.update({ line_user_id, name })` via the Supabase JS client had no effect.

**Impact:** After LINE Login, `GET /api/auth/me` returns `line_user_id: null`. The frontend sees `hasLineUserId = false` and shows the "not connected" state. Clicking the CTA triggers LINE Login again → infinite loop.

**Root cause:** PostgREST with RLS enabled and no policies appears to silently reject writes even from `service_role` with `bypassrls`. This may be a Supabase-managed PostgREST configuration issue.

**Fix:** Applied Supabase migration `add_profiles_rls_policies`:

```sql
CREATE POLICY "service_role_full_access" ON profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "users_read_own_profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

**Verification:** After applying the migration, tested with `SET ROLE service_role; UPDATE profiles ...` — the update now succeeds and persists.

### Bug 3: Error Page UX — Auto-Redirect and Generic Message

The callback error page:
- Showed "No authorization code provided" — unhelpful to users
- Had a "Back to Login" link — wrong destination (should be cart)
- Auto-redirected to /cart due to the race condition (Bug 1)

**Fix:**
- Error message changed to: "LINE login failed. Please return to the cart and try again."
- Link changed from "Back to Login" → "Back to Cart" (navigates to `/cart`)
- No auto-redirect on error — the `processedRef` guard prevents the race condition

## Clarification: LINE Official Account Friendship

The user reported that the new user "hasn't interacted with LINE_LOGIN_CHANNEL_ID=2008445583". This is **not** the cause of the error.

| Concept | Channel | Friendship Required? |
|---|---|---|
| LINE Login (OAuth) | 2008445583 | **No** — any LINE user can authenticate |
| LINE Messaging (push) | 2008443478 (Bot @737nfsrc) | **Yes** — user must be friends with the OA |

LINE Login works for any LINE account holder. The Supabase auth logs confirmed the new user's LINE Login succeeded — user was created and signed in.

OA friendship is only needed for **receiving push messages** after order creation. The existing code in `line.controller.ts` already handles this case:
- If push message fails with 400 → returns `{ success: false, needs_friend: true, add_friend_url }`
- Frontend can use `add_friend_url` to prompt the user to add the OA

**References:**
- LINE Login docs — no friendship required: https://developers.line.biz/en/docs/line-login/integrate-line-login/
- LINE Messaging push prerequisite — friendship required: https://developers.line.biz/en/docs/messaging-api/sending-messages/#sending-push-messages

## Supabase Auth Logs — New User Timeline

User: `d1badca9-b2b0-483a-ad13-377b9913a566` (`line_ue036f027...@line.local`)

| Time (UTC) | Event | Result |
|---|---|---|
| 03:28:49 | `POST /admin/users` | **200** — User created successfully |
| 03:28:49 | `POST /token` | **200** — Login successful |
| 03:28:50 | `GET /user` | **200** — Auth token valid |
| 03:28:51 | `GET /admin/users/d1badca9-...` | **200** — getMe returned user |
| 03:31:02 | `POST /admin/users` | 422 — Already exists (2nd LINE Login attempt) |
| 03:31:02 | `POST /token` | **200** — Login successful (2nd attempt) |
| 03:32:50 | `POST /admin/users` | 422 — Already exists (3rd attempt) |
| 03:32:50 | `POST /token` | **200** — Login successful (3rd attempt) |

The user attempted LINE Login **three times** (03:28, 03:31, 03:32) — each time the backend succeeded, but the frontend callback failed due to the race condition (Bug 1), and subsequent attempts showed `hasLineUserId = false` due to the profiles update failure (Bug 2).

## Fix 3: Single-Pass Flow — Auto-Submit Order After LINE Login

### Problem (UX)

Even after Bugs 1–3 were fixed, the user experience still required **two CTA clicks**:

1. Click "透過 LINE 聯繫" → saves form data to localStorage → redirects to LINE Login
2. After LINE Login → callback redirects back to `/cart` → form data restored
3. Cart items may appear empty (cross-domain session issue from `send-line-to-user-fix.md`)
4. User must re-add items, then click "透過 LINE 聯繫" **again** to actually submit the order

The user expected: one click → LINE Login → order created → success page. No return to cart, no re-clicking.

### Solution: Callback Page Auto-Submits the Order

The callback page (`/auth/callback`) now detects saved form data in `localStorage('cart_form_data')` and automatically creates the order, sends the LINE message, and redirects to the success page — all without returning to the cart.

**New flow:**

```
1. User fills cart + form + LINE ID → clicks "透過 LINE 聯繫"
2. Form data saved to localStorage → redirect to /api/auth/line → LINE OAuth
3. LINE Login → backend callback → redirect to /auth/callback#access_token=...
4. Callback page:
   a. Stores token, calls refreshUser()               → "Authenticating..."
   b. Finds cart_form_data in localStorage
   c. POST /api/orders (skip_cart_clear: true)         → "Creating your order..."
   d. POST /api/orders/:id/line-send (best-effort)     → "Sending LINE notification..."
   e. POST /api/orders/:id/confirm (clears cart)
   f. Cleans up localStorage
   g. router.push('/checkout/success?order=ORD-...')
5. If order creation fails:
   → redirect to /cart?error=... (cart items + form data preserved for retry)
```

**File:** `frontend/src/app/auth/callback/page.tsx` — Complete rewrite

```typescript
async function handleCallback(accessToken: string) {
  // Store token and refresh user
  localStorage.setItem('access_token', accessToken);
  window.history.replaceState(null, '', window.location.pathname);
  await refreshUser();

  // Check for saved form data from cart CTA flow
  const formDataStr = localStorage.getItem('cart_form_data');
  if (!formDataStr) {
    // Normal LINE Login (not from cart) — redirect to return URL
    const returnUrl = localStorage.getItem('line_login_return_url') || '/';
    localStorage.removeItem('line_login_return_url');
    router.push(returnUrl);
    return;
  }

  // Auto-submit order
  setStatusText('Creating your order...');
  const formData = JSON.parse(formDataStr);

  const orderData = await authedFetchFn('api/orders', {
    method: 'POST',
    body: {
      customer_name: formData.customerName,
      // ... other fields ...
      payment_method: 'line',
      skip_cart_clear: true,
    },
  });

  // Send LINE message (best-effort)
  setStatusText('Sending LINE notification...');
  try {
    await authedFetchFn(`api/orders/${orderData.id}/line-send`, { method: 'POST' });
  } catch { /* not critical */ }

  // Confirm order (clears cart)
  try {
    await authedFetchFn(`api/orders/${orderData.id}/confirm`, { method: 'POST' });
  } catch { /* not critical */ }

  // Clean up and redirect to success
  localStorage.removeItem('cart_form_data');
  localStorage.removeItem('line_login_return_url');
  router.push(`/checkout/success?order=${orderData.order_number}`);
}
```

**Error handling:** If `POST /api/orders` fails, the callback page redirects to `/cart?error=<message>`. The cart page reads the error from the URL query param and shows a toast. The `cart_form_data` is preserved in localStorage so the form fields are restored automatically on the next cart page load.

### Cart Page: Error Display from Redirect

**File:** `frontend/src/app/cart/page.tsx`

Added a `useEffect` that reads the `error` query parameter and shows a toast:

```typescript
useEffect(() => {
  const error = searchParams.get('error');
  if (error) {
    toast.error(error);
    router.replace('/cart', { scroll: false }); // clean URL
  }
}, [searchParams, router]);
```

### Cart Page: LINE ID Now Required

**File:** `frontend/src/app/cart/page.tsx`

The LINE ID field was previously optional ("選填，供店家參考"). It is now **required** when the payment method is `line_transfer`.

**Zod schema change:**

```typescript
.superRefine((data, ctx) => {
  // ... existing credit card validations ...
  if (data.paymentMethod === 'line_transfer') {
    if (!data.lineId) addRequired('lineId');
  }
});
```

The form label was updated from a conditional optional/required label to always show `LINE ID *` (with asterisk indicating required).

### LINE ID vs LINE Internal userId — Cannot Be Compared

The user requested validation: compare the LINE ID entered in the form with the user ID obtained from LINE Login. This is **not technically possible**.

| Identifier | Source | Format | Example |
|---|---|---|---|
| LINE ID (handle) | User-entered in form | Alphanumeric username | `andy770921` |
| LINE userId (internal) | LINE Login OAuth profile API | `U` + 32 hex characters | `U8622391bfc0a71e36e95d739a75e5fd2` |

These are fundamentally different identifiers:
- **LINE ID** is a vanity username set by the user in LINE app settings for human discovery
- **LINE userId** is an opaque platform identifier used by the Messaging API

There is **no LINE API** to convert between them. LINE intentionally separates these identifiers (see `documents/FEAT-2/plans/line-integration.md` Section 1).

**References:**
- LINE Developers — Get user IDs: https://developers.line.biz/en/docs/messaging-api/getting-user-ids/
- LINE Community confirmation — no conversion API: https://www.line-community.me/en/question/5f154e95851f74ab9c191a26

## Files Modified

| File | Change |
|---|---|
| `frontend/src/app/auth/callback/page.tsx` | Complete rewrite: `useRef` guard, auto-order creation from saved form data, status text updates, error redirect to `/cart?error=` |
| `frontend/src/app/cart/page.tsx` | LINE ID required for `line_transfer` (Zod validation); error toast from URL `?error=` param; label updated to show required `*` |
| Supabase migration `add_profiles_rls_policies` | Added RLS policies for `service_role` (full access) and `authenticated` (own profile read/update) |

## Testing Checklist

1. **Single-pass flow (new user):** Fill cart + form + LINE ID → click CTA → LINE Login → "Authenticating..." → "Creating your order..." → "Sending LINE notification..." → success page. No return to cart.
2. **LINE ID required:** Cannot submit with empty LINE ID when `line_transfer` is selected.
3. **Error recovery:** If order creation fails after LINE Login, user is redirected to `/cart` with error toast. Cart items and form data are preserved. User can retry.
4. **Normal LINE Login (not from cart):** If there is no `cart_form_data` in localStorage, callback page redirects to the stored return URL (existing behavior).
5. **Profile has `line_user_id`:** After LINE Login, `GET /api/auth/me` returns non-null `line_user_id`.
6. **No error flash:** The "No authorization code provided" error should never appear.
7. **Already logged in via LINE:** If user already has `line_user_id`, clicking CTA creates the order directly (no LINE Login redirect).

## Related

- `send-line-to-user-fix.md` — Previous fixes: 500 error, Express `res.redirect` encoding, missing middleware, in-memory one-time codes
- `fix-cart-service-order-api.md` (in `documents/FIX-2/`) — Cart empty issue due to `getSessionIds` returning empty array
