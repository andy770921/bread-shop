# Review Report: FEAT-1 Papa Bakery Planning Documents

Reviewed: `prd.md`, `database-schema.md`, `shared-types.md`, `auth-and-cart-session.md`, `backend-api.md`, `payment-and-line.md`, `frontend-ui.md`

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 19 |
| MEDIUM | 19 |
| LOW | 8 |

---

## CRITICAL

### C-1. No order ownership verification on payment and LINE endpoints

`POST /api/payments/checkout` and `POST /api/orders/:id/line-send` fetch orders by ID without verifying the requesting session/user owns that order. An attacker who guesses an order ID can generate checkout URLs or send LINE messages for other users' orders.

**Affected files:** `backend-api.md`, `payment-and-line.md`
**Remediation:** Add `session_id` or `user_id` filter to order queries in `PaymentService.createCheckout()` and `LineController.sendViaLine()`. Pass `sessionId` and `userId` from the controller and add `WHERE` conditions.

### C-2. LINE Login callback passes tokens in URL query parameters

`auth-and-cart-session.md` redirects to `${FRONTEND_URL}/auth/callback?access_token=...&refresh_token=...`. Tokens in URLs appear in browser history, server logs, and Referrer headers.

**Affected files:** `auth-and-cart-session.md`
**Remediation:** Store tokens in a short-lived server-side record keyed by a one-time `code`. Redirect with `?code=xxx`. Frontend exchanges the code for tokens via a backend endpoint.

### C-3. Session cookie lost mid-checkout

If the user clears cookies between order creation and Lemon Squeezy redirect-back, the success page cannot display order details because `GET /api/orders/:id` requires auth or session.

**Affected files:** `backend-api.md`, `payment-and-line.md`
**Remediation:** The `/checkout/success` page should accept `order_id` and `order_number` as query params. Add a public endpoint `GET /api/orders/by-number/:orderNumber` that returns limited order info (status, total) without requiring auth.

### C-4. `rawBody` configuration for webhooks is incomplete

`backend-api.md` passes `{ rawBody: true }` to `NestFactory.create()`, but NestJS 11 + Express needs route-specific body parser configuration. The webhook route needs raw body while all other routes need JSON.

**Affected files:** `backend-api.md`
**Remediation:** Use NestJS built-in raw body support: `NestFactory.create(AppModule, { rawBody: true })` stores raw body on `req.rawBody` alongside the parsed JSON body. This works in NestJS 10+. No route-specific config needed, but verify NestJS 11 compatibility and document the approach.

### C-5. Cross-origin cookies will NOT work in production

If frontend and backend are deployed on different domains (e.g., `*.vercel.app`), `SameSite=Lax` cookies set by the backend will not be sent in cross-origin `fetch` with `credentials: 'include'`.

**Affected files:** `auth-and-cart-session.md`, `backend-api.md`, `prd.md`
**Remediation:** Use the Next.js API route proxy approach: frontend `/api/*` requests are rewritten to the backend (already configured in `next.config.ts`). Session cookies stay on the frontend domain. In production, keep the rewrite pointing to the backend service URL. This avoids cross-origin cookie issues entirely.

---

## HIGH

### H-1. `Category` shared type omits `created_at` (ref 1.1)

The DB table has `created_at` but the TypeScript `Category` interface does not.

**Affected files:** `shared-types.md`
**Remediation:** Add `created_at: string` to the `Category` interface.

### H-2. `CartItem` exposes `session_id` to frontend (ref 1.3)

`session_id` is a sensitive internal identifier that should not be sent to clients.

**Affected files:** `shared-types.md`, `backend-api.md`
**Remediation:** Remove `session_id` from the `CartItem` interface. Omit it in the cart service response mapping.

### H-3. `clearCart` returns incorrect totals for empty cart (ref 1.8)

Returns `{ shipping_fee: 60, total: 60 }` for an empty cart. Should be 0/0.

**Affected files:** `backend-api.md`, `shared-types.md`
**Remediation:** Return `{ items: [], subtotal: 0, shipping_fee: 0, total: 0, item_count: 0 }`.

### H-4. `localStorage` token storage is vulnerable to XSS (ref 2.3)

If any XSS vulnerability exists, the attacker can steal the access token.

**Affected files:** `frontend-ui.md`
**Remediation:** Accept this as a known trade-off for the MVP. Document that migrating to HttpOnly cookie-based token storage is a future improvement. Add `Content-Security-Policy` headers to reduce XSS risk.

### H-5. Existing `main.ts` uses `origin: true` CORS (ref 2.4)

Reflects any requesting origin, which is insecure.

**Affected files:** `backend-api.md`
**Remediation:** Update CORS to explicit allowlist: `origin: [process.env.FRONTEND_URL || 'http://localhost:3001']`.

### H-6. Webhook endpoint hit by SessionMiddleware (ref 2.5)

Creates a garbage session row on every Lemon Squeezy webhook call.

**Affected files:** `auth-and-cart-session.md`, `backend-api.md`
**Remediation:** Exclude webhook routes from the middleware: `.exclude('api/webhooks/*')`.

### H-7. LINE controller accepts `line_user_id` from request body (ref 2.6)

Unauthenticated users can provide arbitrary LINE user IDs, enabling message spam via the shop's OA.

**Affected files:** `payment-and-line.md`
**Remediation:** Remove `req.body?.line_user_id` fallback. Require LINE Login (user must be authenticated with a linked LINE account). Fetch `line_user_id` from the `profiles` table only.

### H-8. Order number generation race condition (ref 2.9)

`COUNT(*) + 1` under concurrent inserts can produce duplicate order numbers.

**Affected files:** `database-schema.md`
**Remediation:** Replace with a PostgreSQL `SEQUENCE`: `CREATE SEQUENCE order_number_seq;` and use `LPAD(nextval('order_number_seq')::TEXT, 4, '0')`.

### H-9. Lemon Squeezy webhook silently ignores missing orders (ref 3.2)

Payment succeeds on Lemon Squeezy but local order is never updated.

**Affected files:** `payment-and-line.md`
**Remediation:** Log a warning when `order_id` from webhook custom data does not match any local order. Consider inserting an `orphan_payments` record for reconciliation.

### H-10. LINE `pushMessage` fails with 500 when user hasn't friended OA (ref 3.3)

LINE API returns 400, controller doesn't catch it.

**Affected files:** `payment-and-line.md`
**Remediation:** Wrap `pushMessage` in try/catch. Return a user-friendly error message: `{ success: false, message: 'Please add our LINE Official Account as a friend first.' }`.

### H-11. Cart merge race condition on double-click login (ref 3.4)

Non-atomic merge can double quantities.

**Affected files:** `auth-and-cart-session.md`
**Remediation:** Wrap the merge logic in a Supabase RPC function that runs as a single transaction, or use `SELECT ... FOR UPDATE` to lock the session rows during merge.

### H-12. Inactive products can be ordered (ref 3.5)

Products that become `is_active = false` remain in carts and pass through to order creation.

**Affected files:** `backend-api.md`
**Remediation:** In `OrderService.createOrder()`, filter cart items to only include active products. Warn the user if any items were removed.

### H-13. Module `*.module.ts` declarations missing (ref 4.2)

Controllers and services are shown but `@Module()` declarations are not. `OrderModule` needs `CartService` injection.

**Affected files:** `backend-api.md`
**Remediation:** Add module declarations for all 8 modules. `CartModule` must export `CartService`. `OrderModule` must import `CartModule`.

### H-14. `handleLineLogin()` implementation incomplete (ref 4.3)

Method has `// ...` placeholders and uses `generateLink` which returns a URL, not session tokens.

**Affected files:** `auth-and-cart-session.md`
**Remediation:** Use `supabase.auth.admin.generateLink({ type: 'magiclink', ... })` to get the token hash, then call `supabase.auth.verifyOtp()` to create a session. Or use `supabase.auth.admin.createUser()` + `supabase.auth.signInWithPassword()` with the auto-generated password stored securely.

### H-15. `signUp` session may be null (ref 4.4)

With email confirmation enabled, `data.session` is null. Non-null assertions crash.

**Affected files:** `auth-and-cart-session.md`
**Remediation:** Disable email confirmation in Supabase dashboard for this project (bakery shop doesn't need it), or handle the null case by returning a "please verify your email" response.

### H-16. Missing npm dependencies (ref 4.5, 4.6)

New packages not yet in `package.json` for both backend and frontend.

**Affected files:** `backend-api.md`, `frontend-ui.md`
**Remediation:** Already documented in install steps. Ensure these are run before implementation. Frontend also needs `tailwindcss`, `postcss`, `autoprefixer` (installed as part of `npx shadcn@latest init`).

### H-17. Session middleware hits DB on every request (ref 5.1)

1-2 Supabase queries per request, including read-only product listings.

**Affected files:** `auth-and-cart-session.md`
**Remediation:** Only create sessions lazily (on first cart write operation), not on every request. For read-only endpoints like `GET /api/products`, skip session creation. Alternatively, add a short in-memory cache (60s TTL) for session lookups.

---

## MEDIUM

### M-1. `getOrdersByUser` returns raw Supabase rows with extra fields (ref 1.4)

Returns `user_id`, `payment_id`, `line_user_id` to the client.

**Affected files:** `backend-api.md`
**Remediation:** Use explicit `select()` columns instead of `select('*')`.

### M-2. `UserProfile` and `MeResponse` type mismatch (ref 1.7)

Two types represent the same entity differently.

**Affected files:** `shared-types.md`
**Remediation:** Merge into one `UserProfile` type with all fields. Use `Omit<>` where `line_user_id` should be excluded.

### M-3. No CSRF token protection (ref 2.7)

`SameSite=Lax` doesn't cover all attack vectors.

**Affected files:** `auth-and-cart-session.md`
**Remediation:** Accept as known trade-off for MVP. The Next.js proxy approach (C-5 remediation) keeps cookies same-origin, which eliminates most CSRF vectors. Document as a future hardening task.

### M-4. No rate limiting on auth endpoints (ref 2.8)

Enables brute-force attacks and account enumeration.

**Affected files:** `backend-api.md`
**Remediation:** Add `@nestjs/throttler` module. Apply `@Throttle(5, 60)` (5 requests per 60 seconds) to login and register endpoints.

### M-5. No cart item quantity upper limit (ref 3.6)

Users can add `quantity: 999999`.

**Affected files:** `backend-api.md`, `shared-types.md`
**Remediation:** Add `@Max(99)` validation to `AddToCartDto` and `UpdateCartItemDto`. Add `CHECK (quantity <= 99)` in the DB.

### M-6. Lemon Squeezy webhook only handles `order_created` (ref 3.8)

Refund events are ignored.

**Affected files:** `payment-and-line.md`
**Remediation:** Add handler for `order_refunded` event. Update order status to `cancelled` on refund.

### M-7. Session expiry cascade-deletes cart items (ref 3.9)

Users lose their cart with no warning after 30 days.

**Affected files:** `database-schema.md`
**Remediation:** Extend TTL to 90 days. Add `updated_at` to sessions and refresh TTL on every session access in the middleware.

### M-8. Guard injection across modules (ref 4.7)

`AuthGuard` and `OptionalAuthGuard` used across multiple modules without clear export setup.

**Affected files:** `backend-api.md`
**Remediation:** Register guards as global providers in `SupabaseModule` (which is `@Global()`), or make `AuthModule` export them and have each consuming module import `AuthModule`.

### M-9. Providers import mismatch (ref 4.8)

Existing `providers.tsx` uses default import; planned code uses named import.

**Affected files:** `frontend-ui.md`
**Remediation:** Match the existing export style. Use named export `{ TanStackQueryProvider }` consistently.

### M-10. Existing fetcher missing `credentials: 'include'` (ref 4.9)

Session cookie won't be sent with API calls through the existing fetch infrastructure.

**Affected files:** `frontend-ui.md`
**Remediation:** Add `credentials: 'include'` to `getFetchQueryOptions()` in `fetchers.utils.ts`. Also add it to the TanStack Query default `queryFn`.

### M-11. No Supabase type generation (ref 4.10)

All `.select()` results are `any`.

**Affected files:** `backend-api.md`
**Remediation:** Run `npx supabase gen types typescript` and import generated `Database` type into `SupabaseService`. Pass as generic to `createClient<Database>()`.

### M-12. i18n is client-side only, kills SSR (ref 4.11)

Entire home page is `'use client'`, negating Next.js SSR/SEO benefits.

**Affected files:** `frontend-ui.md`
**Remediation:** Accept for MVP. Product data fetched via TanStack Query is client-side by nature. For SEO improvement in a future iteration, use `next-intl` with server components and `generateStaticParams` for locale-based routes.

### M-13. Redundant cart double-fetch after mutations (ref 5.3)

Cart mutations return the full cart AND frontend `invalidateQueries` refetches.

**Affected files:** `frontend-ui.md`
**Remediation:** Use `queryClient.setQueryData(['cart'], returnedData)` in `onSuccess` instead of `invalidateQueries`. This avoids the extra fetch.

### M-14. No `next/image` optimization (ref 5.4)

Raw Unsplash URLs without Next.js image optimization.

**Affected files:** `frontend-ui.md`
**Remediation:** Use `next/image` `Image` component with `unoptimized` for external URLs, or configure `images.remotePatterns` in `next.config.ts` for `images.unsplash.com`.

### M-15. No unified `.env.example` (ref 6.2)

Environment variables scattered across documents.

**Affected files:** `backend-api.md`, `auth-and-cart-session.md`, `payment-and-line.md`
**Remediation:** Add a consolidated env var list to `backend-api.md` Step 1.

### M-16. Vercel serverless 10s timeout concern (ref 6.4)

Cold start + session middleware may exceed 10s.

**Affected files:** `backend-api.md`
**Remediation:** Lazy session creation (H-17) reduces latency. Consider Supabase connection pooling (`?pgbouncer=true`). Document Vercel timeout constraint.

### M-17. No database migration tool (ref 6.5)

Manual SQL execution is not repeatable.

**Affected files:** `database-schema.md`
**Remediation:** Use Supabase CLI migrations: `supabase migration new init` and commit SQL files. Document the workflow.

### M-18. Missing design tokens in globals.css (ref 7.1)

Neutral scale (200-600), `--text-tertiary`, spacing tokens, radius tokens, `--shadow-header` not mapped.

**Affected files:** `frontend-ui.md`
**Remediation:** Add full token set to `globals.css`. Map spacing and radius tokens to Tailwind `extend` config.

### M-19. Body font stack mismatch (ref 7.2) and card hover translateY (ref 7.3)

Design spec says `Segoe UI, Roboto, ...` and `translateY(-6px)`. Plan uses `system-ui` and `-4px`.

**Affected files:** `frontend-ui.md`
**Remediation:** Update font stack and hover transform to match design-token.md exactly.

---

## LOW

### L-1. `is_active`, `sort_order` exposed to frontend (ref 1.2)

Internal fields visible to clients.

**Remediation:** Accept for MVP. These fields are not sensitive.

### L-2. `useCategories` hook referenced but not defined (ref 1.9)

**Remediation:** Add the hook definition to `frontend-ui.md`.

### L-3. Webhook signature not timing-safe (ref 2.10)

**Remediation:** Use `crypto.timingSafeEqual()` in `payment-and-line.md`.

### L-4. Existing `@/constants/common` compatibility not verified (ref 4.12)

**Remediation:** Verify during implementation.

### L-5. Google Fonts via `<link>` instead of `next/font` (ref 5.5)

**Remediation:** Use `next/font/google` with `Noto_Serif_TC` in `frontend-ui.md`.

### L-6. `throwOnError: true` with no error boundary (ref 5.6)

**Remediation:** Add a React error boundary wrapper in `providers.tsx`.

### L-7. Line heights from design tokens not configured (ref 7.4)

**Remediation:** Add `line-height: 1.65` for body and `1.2` for headings in `globals.css`.

### L-8. Responsive breakpoints not documented (ref 7.5)

**Remediation:** Document grid column counts per breakpoint in `frontend-ui.md`.

---

## Top 5 Action Items (Fix Before Implementation)

1. **C-5: Cross-origin cookie strategy** — Use Next.js API proxy to keep cookies same-origin. This is already partially configured in `next.config.ts` rewrites.
2. **C-1: Order ownership verification** — Add session/user ownership checks to payment and LINE endpoints.
3. **C-2: LINE Login token passing** — Use a short-lived code exchange instead of URL query parameters.
4. **H-14: Complete `handleLineLogin()`** — The method is incomplete and won't compile.
5. **H-6 + C-4: Webhook route handling** — Exclude webhook routes from SessionMiddleware and verify rawBody support.
