# Implementation Plan: Send LINE Message to Customer

## Overview

When a customer selects "LINE 聯繫，銀行轉帳", two mechanisms deliver the order to the customer:

1. **Automated push (if LINE-linked):** If the customer logged in via LINE Login, their internal `line_user_id` is in the `profiles` table. The existing `sendOrderMessage()` pushes a flex message to them automatically.
2. **Manual contact via LINE ID (fallback):** The customer's LINE ID handle is stored in `orders.customer_line_id` and included in the admin's flex message. The admin searches for the customer in the LINE app.

To bridge these two paths, the cart page now prompts users to log in via LINE before checkout. After LINE Login, the OAuth flow captures the internal userId, enabling automated push.

See `documents/FEAT-2/plans/line-integration.md` for the full LINE API feasibility analysis.

## Files Modified

### Database

- `orders` table — Added `customer_line_id` text column (nullable)

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_line_id text;
```

### Shared Types

- `shared/src/types/order.ts`
  - Added `customer_line_id?: string` to `CreateOrderRequest`
  - Added `customer_line_id: string | null` to `Order`

### Backend Changes

- `backend/src/order/dto/create-order.dto.ts`
  - Added optional `customer_line_id` string field with `@IsOptional()` + `@IsString()`

- `backend/src/order/order.service.ts`
  - Added `customer_line_id: dto.customer_line_id` to the order insert object in `createOrder()`

- `backend/src/line/line.service.ts`
  - Updated `buildOrderFlexMessage()` to include a green-colored `LINE ID: <value>` row in the customer details section when `order.customer_line_id` is present

- `backend/src/auth/auth.controller.ts`
  - Added missing `GET /api/auth/line` endpoint to initiate LINE OAuth flow (was 404 before)
  - Uses `req.get('host')` instead of `X-Forwarded-Host` to construct `redirect_uri` (see Step 5b)

### Frontend Changes

- `frontend/src/app/cart/page.tsx`
  - Imports `useAuth` from `@/lib/auth-context`
  - Reads `user.line_user_id` to determine LINE linked state (`hasLineUserId`)
  - On mount: restores form data from `localStorage('cart_form_data')` if present (after LINE Login redirect)
  - `onSubmit` dual-purpose: if LINE transfer + not logged in → saves form data to localStorage + redirects to LINE OAuth; if logged in → submits order
  - When LINE transfer is selected:
    - **User has `line_user_id`:** Green "已連結 LINE" notice + optional LINE ID field
    - **User lacks `line_user_id`:** LINE ID field + CTA with hint text "點擊後將先進行 LINE 登入..."
  - On submit, sends `customer_line_id: values.lineId` to backend when LINE transfer

- `frontend/src/app/auth/callback/page.tsx`
  - After successful LINE OAuth exchange, reads `localStorage('line_login_return_url')`
  - Redirects to the stored URL (e.g., `/cart`) instead of always going to `/`
  - Removes the key from localStorage after reading

- `frontend/src/i18n/zh.json` + `en.json`
  - Added keys: `lineLinked`, `lineLoginPrompt`, `lineLoginBtn`, `lineIdOptional`, `lineLoginHint`

## Step-by-Step Implementation

### Step 1: Database Migration

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_line_id text;
```

**Rationale:** Separate from the existing `line_user_id` column which stores the internal LINE userId from OAuth. `customer_line_id` stores the user-provided LINE ID handle for admin reference.

---

### Step 2: Update Shared Types

**File:** `shared/src/types/order.ts`

**Changes:**
- Add `customer_line_id?: string` to `CreateOrderRequest`
- Add `customer_line_id: string | null` to `Order` interface

---

### Step 3: Update Backend DTO

**File:** `backend/src/order/dto/create-order.dto.ts`

**Changes:** Add:

```typescript
@ApiPropertyOptional({ example: '@john123', description: 'Customer LINE ID handle for admin contact' })
@IsOptional()
@IsString()
customer_line_id?: string;
```

---

### Step 4: Update Order Service

**File:** `backend/src/order/order.service.ts`

**Changes:** In `createOrder()`, add `customer_line_id: dto.customer_line_id` to the insert object.

---

### Step 5: Update LINE Flex Message

**File:** `backend/src/line/line.service.ts`

**Changes:** In `buildOrderFlexMessage()`, add a LINE ID row before the notes row in the customer details section:

```typescript
...(order.customer_line_id
  ? [{
      type: 'text' as const,
      text: `LINE ID: ${order.customer_line_id}`,
      size: 'xs' as const,
      color: '#06C755',  // LINE brand green
      wrap: true,
    }]
  : []),
```

**Rationale:** The admin sees the customer's LINE ID in the order notification and can search for them in the LINE app.

---

### Step 5b: Add Missing `GET /api/auth/line` Endpoint

**File:** `backend/src/auth/auth.controller.ts`

**Problem:** The frontend redirects to `/api/auth/line` to initiate LINE OAuth, but this endpoint did not exist. The backend only had `GET /api/auth/line/callback` (receives LINE's redirect) and `POST /api/auth/line/exchange` (one-time code exchange). Requests to `/api/auth/line` returned 404.

**Changes:** Added a new `GET /api/auth/line` endpoint:

```typescript
@Get('line')
async lineLogin(@Req() req: Request, @Res() res: Response) {
  const channelId = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_ID');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');  // NOT X-Forwarded-Host
  const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/line/callback`);
  const state = randomUUID();
  const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${state}&scope=profile%20openid`;
  res.redirect(lineAuthUrl);
}
```

**Critical: `req.get('host')` vs `X-Forwarded-Host`**

The `redirect_uri` must match a URL registered in the LINE Developer Console. The registered callback URLs are backend URLs (e.g., `https://papa-bread-api.vercel.app/api/auth/line/callback`).

When this endpoint is called through the frontend's Next.js rewrite proxy (`papa-bread.vercel.app` → `papa-bread-api.vercel.app`), the `X-Forwarded-Host` header contains the **frontend** host (`papa-bread.vercel.app`). Using it would produce a redirect_uri like `https://papa-bread.vercel.app/api/auth/line/callback` — which is NOT registered in LINE Console, causing a `400 Bad Request: Invalid redirect_uri` error.

Using `req.get('host')` returns the backend's actual host (`papa-bread-api.vercel.app`), which matches the registered callback URL.

| Header | Value (via frontend proxy) | Value (direct to backend) |
|--------|---------------------------|--------------------------|
| `X-Forwarded-Host` | `papa-bread.vercel.app` (frontend) | `papa-bread-api.vercel.app` |
| `Host` (`req.get('host')`) | `papa-bread-api.vercel.app` (backend) | `papa-bread-api.vercel.app` |

The existing `line/callback` endpoint is not affected because LINE redirects the user's browser directly to the backend URL — no frontend proxy involved.

**LINE Developer Console callback URLs required:**
- `http://localhost:3000/api/auth/line/callback` (local dev)
- `https://papa-bread-api.vercel.app/api/auth/line/callback` (production)

---

### Step 6: Dual-Purpose CTA with LINE Login Redirect

**File:** `frontend/src/app/cart/page.tsx`

**Changes:**

1. Import `useAuth` from `@/lib/auth-context`
2. Get `user` from `useAuth()`, derive `hasLineUserId = !!user?.line_user_id`
3. **Form data persistence:** On mount, check `localStorage('cart_form_data')` and restore via `form.reset()` if present (handles return from LINE Login redirect)
4. **Dual-purpose `onSubmit`:** When LINE transfer is selected and user is not logged in via LINE, the submit handler saves all form values to `localStorage('cart_form_data')`, stores `line_login_return_url=/cart`, and redirects to `/api/auth/line`. When the user is logged in via LINE, it proceeds with order creation normally.
5. **Simplified LINE transfer UI** (no separate login prompt box):
   - If `hasLineUserId` → green notice with `CheckCircle2` icon: "已連結 LINE 帳號..."
   - LINE ID field with conditional label: `hasLineUserId ? t('cart.lineIdOptional') : t('cart.lineId')`
   - CTA "透過 LINE 聯繫" — always `type="submit"`, disabled by `!form.formState.isValid || submitting`
   - Hint text below CTA (only when not logged in): "點擊後將先進行 LINE 登入，以便自動傳送訂單確認"

---

### Step 7: Update Auth Callback with Return URL

**File:** `frontend/src/app/auth/callback/page.tsx`

**Changes:** After storing `access_token` and calling `refreshUser()`:

```typescript
const returnUrl = localStorage.getItem('line_login_return_url') || '/';
localStorage.removeItem('line_login_return_url');
router.push(returnUrl);
```

**Rationale:** When user initiates LINE login from the cart page, they return to `/cart` after OAuth instead of `/`. The stored return URL is consumed once and cleaned up.

---

### Step 8: Send customer_line_id in Order Creation

**File:** `frontend/src/app/cart/page.tsx`

**Changes:** In the `onSubmit` handler, include:

```typescript
customer_line_id: isLine ? values.lineId : undefined,
```

This sends the LINE ID to the backend only for LINE transfer orders.

---

## End-to-End Flow

### Scenario A: User already logged in via LINE

```
1. User selects "LINE 聯繫，銀行轉帳"
2. Sees green notice: "已連結 LINE 帳號，訂單確認將自動傳送至您的 LINE"
3. LINE ID field is optional (labeled "選填，供店家參考")
4. Fills customer info → CTA enables
5. Clicks "透過 LINE 聯繫"
6. Order created with payment_method='line' + customer_line_id (if filled)
7. Admin receives flex message via LINE push
8. Customer receives flex message via LINE push (using profiles.line_user_id)
9. Redirect to /checkout/success
```

### Scenario B: User not logged in via LINE (dual-purpose CTA flow)

```
1. User selects "LINE 聯繫，銀行轉帳"
2. Sees LINE ID field + CTA "透過 LINE 聯繫" + hint text: "點擊後將先進行 LINE 登入..."
3. Fills customer info (+ optionally LINE ID) → CTA enables
4. Clicks "透過 LINE 聯繫"
   → Form validates (customer info required)
   → Saves all form values to localStorage('cart_form_data')
   → Saves localStorage('line_login_return_url') = '/cart'
   → Redirects to /api/auth/line → LINE OAuth flow
5. After LINE login, callback page reads return URL → redirects to /cart
6. Cart page mounts → restores form data from localStorage → form auto-filled
7. User now has line_user_id → green "已連結 LINE" notice appears, hint text gone
8. Clicks "透過 LINE 聯繫" again → order created → admin + customer receive flex messages
9. Redirect to /checkout/success
```

## Testing Steps

1. **Not logged in, LINE transfer selected**: LINE ID field + CTA disabled + hint text visible
2. **Fill customer info**: CTA enables (LINE ID is optional)
3. **Click "透過 LINE 聯繫" (not logged in)**: Form data saved to localStorage, redirects to LINE OAuth
4. **After LINE login callback**: Redirects to `/cart` (not `/`), form data restored
5. **Logged in via LINE, LINE transfer selected**: Green notice, LINE ID label shows "(選填)", no hint text
6. **Click "透過 LINE 聯繫" (logged in)**: Submits order, customer receives automated push
7. **Order in Supabase**: Verify `customer_line_id` column populated (if filled)
8. **Admin flex message**: Verify LINE ID row appears in green when present
9. **Credit card orders**: Verify `customer_line_id` is NOT sent

## Dependencies

- Depends on: DB migration (Step 1), shared types (Step 2)
- Parallel with: Frontend UI rewrite (see `frontend-ui.md`)

## Notes

- `line_user_id` (existing column in `profiles` and `orders`) stores the internal LINE userId from OAuth — used for automated push messages
- `customer_line_id` (new column in `orders`) stores the user-entered LINE ID handle — used for admin manual contact
- These two columns serve different purposes and should not be confused
- The auth callback return URL is stored in localStorage (not a query parameter) to avoid passing it through the LINE OAuth state flow, which would require backend changes
- **Form data persistence:** `localStorage('cart_form_data')` stores serialized form values before LINE OAuth redirect. Restored on mount via `form.reset()`, then immediately cleaned up. This ensures the user doesn't have to re-fill customer info after LINE Login.
- **Dual-purpose CTA:** There is no separate "使用 LINE 登入" button. The "透過 LINE 聯繫" CTA is `type="submit"` — react-hook-form validates the form first, then `onSubmit` checks `hasLineUserId` and either redirects to LINE Login or submits the order. A small hint text below the CTA ("點擊後將先進行 LINE 登入...") is shown only when the user is not logged in via LINE.
