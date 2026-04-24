# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Papa Bakery online shop. Fullstack monorepo: Next.js customer frontend, Vite admin frontend, NestJS backend, Supabase (PostgreSQL + Auth + Storage). npm workspaces + Turborepo.

```
├── frontend/           # Next.js 15 (App Router) + shadcn/ui + TanStack Query — port 3001 (customer)
├── admin-frontend/     # Vite 6 + React 18 SPA + shadcn/ui — port 3002 (staff backoffice)
├── backend/            # NestJS 11 + Supabase client — port 3000
├── shared/             # @repo/shared — TS types + runtime utils (fetchApi, stringifyQueryKey)
├── documents/          # Work tracking per ticket (FEAT-1 customer shop, FEAT-5 admin backoffice)
└── package.json        # npm workspaces root + Turborepo
```

## Commands

```bash
npm install              # Install all dependencies (from root)
npm run dev              # Start customer FE (:3001) + admin FE (:3002) + BE (:3000) in parallel
npm run build            # Build all workspaces (shared → frontend / admin-frontend / backend)
npm run test             # Run all tests
npm run lint             # Lint all code
npm run format           # Auto-format all files with Prettier
npm run format:check     # Check formatting without writing
```

```bash
cd backend        && npm run test                   # Backend Jest unit tests
cd backend        && npm run test:e2e               # Backend E2E tests
cd frontend       && npx jest src/path/to/file.spec.ts         # Single frontend test
cd admin-frontend && npx vitest run src/path/to/file.spec.ts   # Single admin-frontend test
cd backend        && npx jest src/path/to/file.spec.ts         # Single backend test
cd shared         && npx jest src/path/to/file.spec.ts         # Single shared test
```

**Turbo dependency chain**: `test` and `lint` depend on `^build` (shared types must compile first). If tests fail with missing types, run `npm run build` first. `@repo/shared` emits CommonJS; `admin-frontend/vite.config.ts` handles the CJS/ESM interop via `optimizeDeps.include` + `build.commonjsOptions.include`.

## Architecture

### API URLs (Critical Pattern)

The two frontends reach the backend differently — don't confuse them:

- **Customer frontend**: Next.js rewrites (`frontend/next.config.ts`) proxy `/api/*` to the backend. Fetch calls **must use relative URLs** (`/api/cart`) so the `session_id` HttpOnly cookie stays same-origin. The real backend URL comes from `NEXT_PUBLIC_API_URL`.
- **Admin frontend**: **no proxy**. `admin-frontend/src/lib/admin-fetchers.ts` prepends `import.meta.env.VITE_API_URL` to every path (`https://papa-bread-api.vercel.app/api/auth/login`). The admin doesn't use the session cookie, only Bearer JWT, so cross-origin is fine. `VITE_API_URL` must be set in both `admin-frontend/.env.local` (dev) and Vercel env settings (prod), or the fetcher throws at load time.
- Backend CORS locally allows `FRONTEND_URL` + `ADMIN_FRONTEND_URL`; production serverless entry uses `origin: true`.

### Session-Based Cart

Every visitor gets a `session_id` HttpOnly cookie. Cart items link to sessions, not users directly.

- `SessionMiddleware` (`backend/src/common/middleware/session.middleware.ts`) runs on all `api/*`
- Sessions created lazily (only on cart/favorites/orders GETs or any POST, not on product listing GETs)
- On login: `mergeSessionOnLogin()` links session to user, merges cart items from old sessions
- On logout: session stays, `user_id` cleared — cart remains accessible as guest
- In-memory session cache (60s TTL, max 10k entries) reduces DB hits

### Dual Supabase Clients (Critical)

`SupabaseService` maintains **two separate Supabase clients** (`backend/src/supabase/supabase.service.ts`):

- `getClient()` — for data operations (`.from().select/insert/update/delete`). Always service_role.
- `getAuthClient()` — for auth operations (`signInWithPassword`, `admin.*`).

**Why**: `signInWithPassword` contaminates the client's in-memory session, changing the role from `service_role` to `authenticated` — which breaks RLS on subsequent queries. Never call auth methods on the data client.

### Backend Modules

All follow `Module → Controller → Service`. `SupabaseModule` is `@Global()` — inject `SupabaseService` anywhere.

| Module      | Key Endpoints                                            | Auth                   |
| ----------- | -------------------------------------------------------- | ---------------------- |
| Auth        | POST login, register, logout; GET me; LINE OAuth         | — / Bearer             |
| Product     | GET /api/products(?category=slug), /api/products/:id     | —                      |
| Category    | GET /api/categories                                      | —                      |
| Cart        | GET/POST/PATCH/DELETE /api/cart/\*                       | Session (OptionalAuth) |
| Favorite    | GET/POST/DELETE /api/favorites/\*                        | Bearer required        |
| Order       | POST /api/orders; GET list, detail, by-number            | Session + Bearer       |
| LINE        | POST /api/orders/:id/line-send                           | Bearer required        |
| User        | GET/PATCH /api/user/profile                              | Bearer required        |
| SiteContent | GET /api/site-content                                    | —                      |
| Admin       | /api/admin/{me,dashboard,products,content,orders,upload} | AdminAuthGuard         |

**Guards**:

- `AuthGuard` — requires Bearer JWT via `supabase.auth.getUser()`.
- `OptionalAuthGuard` — passes through guests.
- `AdminAuthGuard` (`backend/src/admin/guards/admin-auth.guard.ts`) — validates Bearer token, then checks `profiles.role IN ('admin', 'owner')`. Throws 403 otherwise. Email is sourced from `auth.users`, not `profiles` (no email column there). Populates `req.user = { id, email, role }`.

Guards inject `SupabaseService` from the global module — no module imports needed.

**Custom decorators**: `@SessionId()` and `@CurrentUser()` extract values from the Express request object.

**Admin order state machine is intentionally relaxed** (`OrderAdminService.ADMIN_BLOCKED_TRANSITIONS`): only `delivered → pending/paid` and `cancelled → delivered/shipping` are blocked. Staff can otherwise move orders freely. This is different from the customer-facing flow which is strict.

### Customer Frontend (`frontend/`)

- `app/providers.tsx` — ThemeProvider → TanStackQuery → **LocaleProvider** → AuthProvider → Toaster. `LocaleProvider` sits inside `TanStackQueryProvider` so `useSiteContent()` can call `useQuery`.
- `lib/auth-context.tsx` — manages JWT in localStorage, invalidates `['cart']` query on login/logout
- `lib/auth-token-store.ts` — Bearer token in localStorage (not HttpOnly); session_id is a separate HttpOnly cookie managed by backend
- `queries/` — TanStack Query hooks with `credentials: 'include'` and `getAuthHeaders()`
- `components/ui/` — shadcn/ui (Tailwind v4), auto-generated via `npx shadcn@latest add`
- `i18n/` — zh.json (default) + en.json. `useLocale()` returns `{ locale, t, toggleLocale }`. The `t()` output is the JSON default **merged with `site_content` overrides** via `i18n/merge-overrides.ts` — overrides come from `useSiteContent()` and are flattened/unflattened against the JSON tree.
- Design tokens as CSS custom properties in `globals.css` (light/dark: `--primary-500`, `--bg-body`, etc.)

### Admin Frontend (`admin-frontend/`)

Vite SPA served on port 3002 for shop staff. Separate auth from the customer FE: Bearer JWT only, no session cookie.

- `lib/admin-auth-context.tsx` — **two-phase login**: POST `/api/auth/login` (gets JWT) → GET `/api/admin/me` (role check). Only `admin`/`owner` accounts pass; others are rejected with a "no admin access" message.
- `lib/admin-auth-guard.tsx` — route-level redirect to `/` when not logged in. Wrap dashboard routes with it.
- `lib/admin-token-store.ts` — stores `admin_token` in localStorage (separate key from customer `auth_token`).
- `lib/admin-fetchers.ts` — wraps the shared `fetchApi` with the Bearer header; used as TanStack Query's default `queryFn`.
- `hooks/use-locale.ts` — `LocaleProvider` + `useLocale()/t()` mirroring the customer FE pattern. Admin is zh-only for v1 but the structure is ready for multi-locale.
- `lib/content-keys.ts` — flattens `@frontend-i18n/{zh,en}.json` into dot-notation key groups for the content editor. Uses TS path alias `@frontend-i18n/*` → `../frontend/src/i18n/*`.
- Shadcn components (`components/ui/`) — generated with `nova` preset. **`Input` and `Textarea` use `React.forwardRef`** so `react-hook-form`'s `register` can attach refs; don't downgrade these back to plain function components or form validation will silently receive empty values.
- Design tokens re-use FEAT-1 palette via CSS custom properties in `globals.css`; shadcn semantic tokens are rewired to map to FEAT-1 (`--primary: var(--primary-500)`).
- Product image upload flow: client requests a Supabase Storage signed upload URL from the backend, then PUTs the file directly to Storage (the backend never proxies file bytes).

### TanStack Query Defaults

Both frontends share the same defaults (see `frontend/src/vendors/tanstack-query/provider.tsx` and `admin-frontend/src/vendors/tanstack-query/provider.tsx`):

- `retry: 0` — no automatic retries on failure
- `throwOnError: true` — errors propagate to error boundaries
- `staleTime: 60s` — avoids immediate refetch after SSR hydration
- **Custom default `queryFn`**: query keys are auto-stringified into URL paths via `stringifyQueryKey` (e.g., `['api', 'cart']` → `/api/cart`, `['api', 'products', { category: 'bread' }]` → `/api/products?category=bread`)

### Shared Package (`@repo/shared`)

Exports **both types and runtime utilities** — previously fetchers lived only in `frontend/`; they were lifted into `shared` so admin-frontend can reuse them. Import surface:

- `types/` — Product, Cart, Order, Auth, User, Favorite, Common, **Admin** (UserRole, AdminMe, AdminDashboardStats), **SiteContent** (SiteContentEntry, UpdateSiteContentRequest)
- `utils/fetchers/` — `fetchApi` (100s AbortController timeout), `streamingFetchApi`, `ApiResponseError` (exposes `status`, `statusText`, `body`)
- `utils/query/` — `stringifyQueryKey` (the TanStack default queryFn URL serializer; replaces lodash with an inline `isPlainObject`)
- `constants/` — `HTTP_STATUS_CODE`

Usage: `import { CartResponse, fetchApi, ApiResponseError } from '@repo/shared'`. Shared emits CommonJS — keep the CJS/ESM interop config in `admin-frontend/vite.config.ts` in place when bumping Vite.

### Database (Supabase)

Tables: `profiles`, `categories`, `products`, `sessions`, `cart_items`, `favorites`, `orders`, `order_items`, `site_content`. RLS enabled but bypassed by service role key. Product images in Storage bucket `product-images` (public) — `image_url` stores the full HTTPS URL.

- `profiles.role` — `customer` (default) / `admin` / `owner`. Checked by `AdminAuthGuard`. Promote a user: `UPDATE public.profiles SET role = 'owner' WHERE id = '<auth.users.id>'`.
- `site_content` — `(key, value_zh, value_en, updated_by, updated_at)`. Overrides for customer FE i18n; consumed by `GET /api/site-content`, written by the admin backoffice.
- RPC `get_top_selling_products(limit_count)` — powers the admin dashboard top-sellers chart.

Key triggers: auto-create profile on auth signup, auto-generate order numbers (`ORD-YYYYMMDD-NNNN` via sequence), auto-update `updated_at` (uses `public.set_updated_at`, not `update_updated_at_column`).

### LINE Integration

- **LINE Login**: OAuth2 → backend callback → one-time code exchange → frontend stores JWT
- **LINE Messaging**: Push Flex Messages for order summaries via `@line/bot-sdk`
- Backend derives callback URL from request headers (`X-Forwarded-Proto` + `Host`) — no `BACKEND_URL` env needed
- Both HTTP (localhost) and HTTPS (Vercel) callback URLs must be whitelisted in LINE Developers Console

## Environment Variables

Copy `.env.example` to actual env files:

- `backend/.env` — Supabase URL/key, `FRONTEND_URL`, `ADMIN_FRONTEND_URL`, `SUPABASE_STORAGE_BUCKET`, LINE credentials
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:3000`
- `admin-frontend/` — no env file needed locally; Vite dev proxy targets `http://localhost:3000`

## Code Style

- **Prettier**: semi, 2-space indent, 100 print width, single quotes, trailing commas
- **ESLint**: unified root `.eslintrc.js` — TypeScript, Next.js, Prettier
- **TypeScript**: strict mode; frontend `moduleResolution: bundler`; backend CommonJS + decorators
- Backend DTOs use `class-validator` decorators + `@nestjs/swagger` for validation and API docs

## Documentation Pattern

```
documents/FEAT-1/   # Customer shop (original build)
documents/FEAT-5/   # Admin backoffice
    ├── plans/        # PRDs, design tokens, HTML mockups
    └── development/  # DB schema, API specs, auth flows, E2E test plans
```

All markdown under `documents/` is written in English (even when chat is in Chinese).

## Deployment (Vercel)

- **Frontend**: root directory `frontend`, auto-detected as Next.js. ESLint disabled during build (runs at monorepo root instead).
- **Admin Frontend**: root directory `admin-frontend`, Vite static build (`npm run build` → `dist/`).
- **Backend**: root directory `backend`, serverless function via `backend/api/index.ts` (lazy NestJS init, singleton pattern)
- **CORS difference**: local dev restricts to `FRONTEND_URL` + `ADMIN_FRONTEND_URL`; serverless entry uses `origin: true` (allows all)
- Serverless limitations: cold starts, no WebSockets, 10s timeout
- Vercel `installCommand` must build shared types before backend / admin-frontend deployment
