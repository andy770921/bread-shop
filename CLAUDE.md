# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Papa Bakery online shop. Fullstack monorepo: Next.js frontend, NestJS backend, Supabase (PostgreSQL + Auth + Storage). npm workspaces + Turborepo.

```
├── frontend/           # Next.js 15 (App Router) + shadcn/ui + TanStack Query — port 3001
├── backend/            # NestJS 11 + Supabase client — port 3000
├── shared/             # Shared TypeScript types (@repo/shared)
├── documents/          # Work tracking (organized by ticket, e.g. FEAT-1/)
└── package.json        # npm workspaces root + Turborepo
```

## Commands

```bash
npm install              # Install all dependencies (from root)
npm run dev              # Start FE (:3001) + BE (:3000) in parallel
npm run build            # Build all workspaces
npm run test             # Run all tests
npm run lint             # Lint all code
npm run format           # Auto-format all files with Prettier
npm run format:check     # Check formatting without writing
```

```bash
cd backend && npm run test          # Backend Jest unit tests
cd backend && npm run test:e2e      # Backend E2E tests
cd frontend && npx jest src/path/to/file.spec.ts   # Single test file
cd backend  && npx jest src/path/to/file.spec.ts   # Single test file
```

**Turbo dependency chain**: `test` and `lint` depend on `^build` (shared types must compile first). If tests fail with missing types, run `npm run build` first.

## Architecture

### API Proxy (Critical Pattern)

Frontend uses **Next.js rewrites** (`next.config.ts`) to proxy `/api/*` to backend. This keeps `session_id` cookies same-origin.

- Frontend fetch calls **must use relative URLs** (`/api/cart`, never `http://localhost:3000/api/cart`)
- The shared `getAuthHeaders()` in `frontend/src/lib/api.ts` provides Bearer token from localStorage
- Backend CORS allows only `FRONTEND_URL` origin (not `origin: true`)

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

| Module   | Key Endpoints                                        | Auth                   |
| -------- | ---------------------------------------------------- | ---------------------- |
| Auth     | POST login, register, logout; GET me; LINE OAuth     | — / Bearer             |
| Product  | GET /api/products(?category=slug), /api/products/:id | —                      |
| Category | GET /api/categories                                  | —                      |
| Cart     | GET/POST/PATCH/DELETE /api/cart/\*                   | Session (OptionalAuth) |
| Favorite | GET/POST/DELETE /api/favorites/\*                    | Bearer required        |
| Order    | POST /api/orders; GET list, detail, by-number        | Session + Bearer       |
| LINE     | POST /api/orders/:id/line-send                       | Bearer required        |
| User     | GET/PATCH /api/user/profile                          | Bearer required        |

**Guards**: `AuthGuard` (requires Bearer JWT via `supabase.auth.getUser()`), `OptionalAuthGuard` (passes through guests). Guards inject `SupabaseService` from the global module — no module imports needed.

**Custom decorators**: `@SessionId()` and `@CurrentUser()` extract values from the Express request object.

### Frontend Structure

- `app/providers.tsx` — ThemeProvider → TanStackQuery → AuthProvider → Toaster
- `lib/auth-context.tsx` — manages JWT in localStorage, invalidates `['cart']` query on login/logout
- `lib/auth-token-store.ts` — Bearer token in localStorage (not HttpOnly); session_id is a separate HttpOnly cookie managed by backend
- `queries/` — TanStack Query hooks with `credentials: 'include'` and `getAuthHeaders()`
- `components/ui/` — shadcn/ui (Tailwind v4), auto-generated via `npx shadcn@latest add`
- `i18n/` — zh.json (default) + en.json, `useLocale()` hook returns `{ locale, t, toggleLocale }`
- Design tokens as CSS custom properties in `globals.css` (light/dark: `--primary-500`, `--bg-body`, etc.)

### TanStack Query Defaults

Configured in `frontend/src/vendors/tanstack-query/provider.tsx`:

- `retry: 0` — no automatic retries on failure
- `throwOnError: true` — errors propagate to error boundaries
- `staleTime: 60s` — avoids immediate refetch after SSR hydration
- **Custom default `queryFn`**: query keys are auto-stringified into URL paths via `stringifyQueryKey` (e.g., `['api', 'cart']` → `/api/cart`, `['api', 'products', { category: 'bread' }]` → `/api/products?category=bread`)

### Frontend Fetch Utilities

`frontend/src/utils/fetchers/fetchers.ts` — shared fetch wrapper:

- 100s default timeout with AbortController
- Custom `ApiResponseError` class exposes `status`, `statusText`, `body`
- `streamingFetchApi` variant returns raw `Response` for streaming

### Shared Types

`shared/src/types/` — Product, Cart, Order, Auth, User, Favorite, Common. Import: `import { CartResponse } from '@repo/shared'`

### Database (Supabase)

Tables: `profiles`, `categories`, `products`, `sessions`, `cart_items`, `favorites`, `orders`, `order_items`. RLS enabled but bypassed by service role key. Product images in Storage bucket `product-images` (public) — `image_url` stores the full HTTPS URL.

Key triggers: auto-create profile on auth signup, auto-generate order numbers (`ORD-YYYYMMDD-NNNN` via sequence), auto-update `updated_at`.

### LINE Integration

- **LINE Login**: OAuth2 → backend callback → one-time code exchange → frontend stores JWT
- **LINE Messaging**: Push Flex Messages for order summaries via `@line/bot-sdk`
- Backend derives callback URL from request headers (`X-Forwarded-Proto` + `Host`) — no `BACKEND_URL` env needed
- Both HTTP (localhost) and HTTPS (Vercel) callback URLs must be whitelisted in LINE Developers Console

## Environment Variables

Copy `.env.example` to actual env files:

- `backend/.env` — Supabase URL/key, FRONTEND_URL, LINE credentials
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:3000`

## Code Style

- **Prettier**: semi, 2-space indent, 100 print width, single quotes, trailing commas
- **ESLint**: unified root `.eslintrc.js` — TypeScript, Next.js, Prettier
- **TypeScript**: strict mode; frontend `moduleResolution: bundler`; backend CommonJS + decorators
- Backend DTOs use `class-validator` decorators + `@nestjs/swagger` for validation and API docs

## Documentation Pattern

```
documents/FEAT-1/
├── plans/        # PRDs, design tokens, HTML mockups
└── development/  # DB schema, API specs, auth flows, E2E test plans
```

## Deployment (Vercel)

- **Frontend**: root directory `frontend`, auto-detected as Next.js. ESLint disabled during build (runs at monorepo root instead).
- **Backend**: root directory `backend`, serverless function via `backend/api/index.ts` (lazy NestJS init, singleton pattern)
- **CORS difference**: local dev restricts to `FRONTEND_URL`; serverless entry uses `origin: true` (allows all)
- Serverless limitations: cold starts, no WebSockets, 10s timeout
- Vercel `installCommand` must build shared types before backend deployment
