# Papa Bakery — Online Shop

An online bakery storefront for Papa Bakery (周爸烘焙坊). Customers can browse products, manage a shopping cart, and place orders via LINE messaging. Supports guest shopping with seamless cart merge on login, bilingual UI (Chinese/English), and light/dark themes.

## Production

| App            | URL                                 |
| -------------- | ----------------------------------- |
| Frontend       | https://papa-bread.vercel.app       |
| Admin Frontend | https://papa-bread-admin.vercel.app |
| Backend        | https://papa-bread-api.vercel.app   |

## Tech Stack

| Layer          | Technology                                                                           |
| -------------- | ------------------------------------------------------------------------------------ |
| Frontend       | Next.js 15 (App Router), shadcn/ui, Tailwind CSS v4, TanStack Query v5               |
| Admin Frontend | Vite 6 + React 18 SPA, react-router-dom v7, shadcn/ui, react-hook-form + zod         |
| Backend        | NestJS 11, class-validator, Swagger                                                  |
| Database       | Supabase (PostgreSQL + Auth + Storage)                                               |
| Auth           | Supabase Auth (email/password + LINE Login OAuth2); admin uses role-gated Bearer JWT |
| Payment        | LINE Messaging API (order via chat), credit-card service placeholder in cart UI      |
| Monorepo       | npm workspaces + Turborepo                                                           |
| Shared         | `@repo/shared` — TypeScript types + runtime fetch/query utilities                    |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp backend/.env.example backend/.env       # fill in Supabase + LINE credentials
cp frontend/.env.example frontend/.env.local

# 3. Start development servers
npm run dev
# Frontend:       http://localhost:3001
# Admin Frontend: http://localhost:3002
# Backend:        http://localhost:3000 (Swagger UI at /api)
```

## Environment Setup

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in credentials. Key variables:

| Variable                                              | Description                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`               | Supabase project credentials                                            |
| `FRONTEND_URL`                                        | Customer frontend origin (e.g. `http://localhost:3001`) — used for CORS |
| `ADMIN_FRONTEND_URL`                                  | Admin frontend origin (e.g. `http://localhost:3002`) — used for CORS    |
| `SUPABASE_STORAGE_BUCKET`                             | Storage bucket for product images (default `product-images`)            |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` | LINE Login channel credentials                                          |
| `LINE_CHANNEL_ACCESS_TOKEN`                           | LINE Messaging API channel token                                        |
| `LINE_ADMIN_USER_ID`                                  | LINE user ID of the shop admin (see below)                              |

### Frontend (`frontend/.env.local`)

Copy `frontend/.env.example` to `frontend/.env.local`. The only required variable is `NEXT_PUBLIC_API_URL=http://localhost:3000`.

### Admin Frontend (`admin-frontend`)

No environment file required for local development — the Vite dev server proxies `/api/*` to `http://localhost:3000` via `admin-frontend/vite.config.ts`. In production the admin frontend talks to the same backend; see **Admin Backoffice** below for how admin users are provisioned.

### LINE Configuration

This project uses two LINE channels:

1. **LINE Login** (for OAuth2 sign-in)
2. **LINE Messaging API** (for pushing order summaries)

#### LINE Login — Callback URLs

In the [LINE Developers Console](https://developers.line.biz/console/), go to your **LINE Login channel** → **LINE Login** tab → **Callback URL**, and add **both** URLs (one per line):

```
http://localhost:3000/api/auth/line/callback
https://papa-bread-api.vercel.app/api/auth/line/callback
```

The first is for local development, the second for Vercel production. The backend dynamically derives the callback URL from request headers (`X-Forwarded-Proto` + `Host`), but LINE Login requires the URL to be whitelisted exactly.

#### LINE Messaging API — Admin User ID

The "透過 LINE 聯繫" (Contact via LINE) feature pushes order details to the shop admin's LINE account. To set this up:

1. Go to [LINE Developers Console](https://developers.line.biz/console/) → your **Messaging API channel** → **Basic settings** tab.
2. Copy the **"Your user ID"** value (format: `U` + 32 hex characters).
3. Set it as `LINE_ADMIN_USER_ID` in `backend/.env`.
4. **Important**: The LINE account corresponding to this user ID must have added the LINE Official Account (bot) as a friend. If not, push messages will fail with HTTP 400 and the frontend will prompt the user to add the OA as a friend.

## Key Features

### Shopping

- **Product catalog** with category filtering and two view modes (grid / editorial)
- **Server-side cart** — all prices computed on the backend, never trusted from the client
- **Guest checkout** — no account required to shop; session cookie tracks the cart
- **Cart merge on login** — guest cart items seamlessly transfer to the authenticated session

### Authentication

- **Email/password** registration and login via Supabase Auth
- **LINE Login** OAuth2 integration with one-time code exchange (tokens never exposed in URL)
- **Session-based identity** — HttpOnly `session_id` cookie (90-day expiry, SameSite=Lax)

### Checkout

- **LINE messaging** — send order summary as a Flex Message to the shop's LINE Official Account
- **Credit-card placeholder** — the `/cart` payment dropdown still shows a credit-card option, but it is intentionally non-interactive while a replacement provider is evaluated

### User Features

- **Favorites** — heart icon on products (requires login)
- **Order history** — status timeline (pending → paid → preparing → shipping → delivered)
- **Profile** — edit name and phone number
- **Bilingual** — toggle between Chinese and English (client-side i18n)
- **Dark mode** — manual toggle with CSS custom property theme system

### Admin Backoffice

A separate Vite SPA (`admin-frontend`, port `3002`) for shop staff:

- **Role-gated login** — reuses Supabase Auth; only accounts with `profiles.role IN ('admin', 'owner')` can sign in. Other roles get 403.
- **Dashboard** — today's order count and revenue, pending-order counter, order status breakdown, top-selling products (via `get_top_selling_products` RPC), recent orders table.
- **Product management** — list, create, edit, archive/publish products. Image upload goes directly to Supabase Storage via signed upload URLs (backend issues the URL, the browser PUTs the file).
- **Site content overrides** — edit any i18n key from the customer frontend (e.g. `nav.home`, `home.hero.title`). Overrides live in a `site_content` table and layer on top of the JSON defaults via `mergeOverrides()` on the customer frontend.
- **Order management** — filter by status, view detail, change status (with relaxed admin state machine), resend the LINE order message to the customer.

To grant an existing account admin access, run in Supabase SQL editor:

```sql
UPDATE public.profiles SET role = 'owner' WHERE id = '<auth.users.id>';
```

## Architecture

```
Customer Browser ─── Next.js (:3001) ── rewrites /api/* ──┐
                                                          ├──→ NestJS (:3000) ──→ Supabase
Admin Browser    ─── Vite SPA (:3002) ── proxy /api/*  ───┘          │
                                                                     │
               shadcn/ui + TanStack Query                  SessionMiddleware (customer only)
               Customer: session cookie + optional JWT     AdminAuthGuard (profiles.role check)
               Admin:    Bearer JWT only                   SupabaseService (service key)
               next-themes (dark mode)                     class-validator (DTOs)
```

**API proxy pattern**: The frontend proxies all `/api/*` requests through Next.js rewrites to the backend. This keeps the `session_id` cookie same-origin, avoiding cross-domain cookie issues entirely. Frontend code always uses relative URLs (`/api/cart`, never `http://localhost:3000`).

**Session-based cart**: Every visitor gets an HttpOnly `session_id` cookie. Cart items are linked to sessions. On login, `mergeSessionOnLogin()` associates the session with the user and merges any existing cart from previous sessions.

## Project Structure

```
├── frontend/src/
│   ├── app/                  # Next.js pages (home, cart, auth, profile, orders, checkout)
│   ├── components/           # UI components (layout, product, cart, auth, shared, ui/)
│   ├── queries/              # TanStack Query hooks (products, cart, favorites, categories)
│   ├── lib/                  # Auth context, API utilities
│   ├── i18n/                 # zh.json + en.json translation files (source of truth for copy)
│   └── hooks/                # useLocale() — merges site_content overrides on top of i18n defaults
├── admin-frontend/src/
│   ├── routes/               # Login, Dashboard, Products, Content, Orders pages
│   ├── components/           # Layout (Sidebar/Topbar), product form + image uploader, shadcn ui/
│   ├── queries/              # TanStack Query hooks for admin APIs
│   ├── lib/                  # Admin auth context/guard, Bearer token store, fetch wrapper
│   ├── hooks/                # useLocale() — zh-only for admin v1
│   └── i18n/                 # zh.json — admin UI copy
├── backend/src/
│   ├── auth/                 # Login, register, LINE OAuth, session merge
│   ├── admin/                # AdminAuthGuard + dashboard/product/content/order/upload admin APIs
│   ├── site-content/         # Public GET /api/site-content — overrides consumed by customer FE
│   ├── product/              # Product listing and detail
│   ├── category/             # Category listing
│   ├── cart/                 # Server-side cart CRUD
│   ├── favorite/             # User favorites
│   ├── order/                # Order creation, history, status
│   ├── line/                 # LINE push message for orders
│   ├── user/                 # Profile management
│   ├── supabase/             # Global Supabase client provider (dual clients: data vs auth)
│   └── common/               # Session middleware, decorators, guards
├── shared/src/
│   ├── types/                # Product, Cart, Order, Auth, User, Favorite, Admin, SiteContent types
│   ├── utils/                # fetchApi, ApiResponseError, stringifyQueryKey (shared by both FEs)
│   └── constants/            # HTTP_STATUS_CODE
├── documents/FEAT-1/         # Customer shop: PRD, design tokens, DB schema, API specs, test plans
└── documents/FEAT-5/         # Admin backoffice: PRD, design, shared types, DB schema, API specs
```

## Database

9 tables in Supabase PostgreSQL: `profiles` (with `role` column: `customer` / `admin` / `owner`), `categories`, `products`, `sessions`, `cart_items`, `favorites`, `orders`, `order_items`, `site_content` (i18n overrides edited from the admin UI).

Product images stored in Supabase Storage (public bucket `product-images`). Seeded with 5 categories and 6 products.

The `get_top_selling_products(limit_count)` RPC powers the admin dashboard's top-seller chart.

## Commands

```bash
npm run dev              # Start customer FE (:3001) + admin FE (:3002) + backend (:3000)
npm run build            # Build all workspaces (shared → frontend / admin-frontend / backend)
npm run test             # Run all tests
npm run lint             # Lint all code
```

## Deployment (Vercel)

Each app is deployed as its own Vercel project against this monorepo:

| App            | Vercel root directory | Notes                                                                           |
| -------------- | --------------------- | ------------------------------------------------------------------------------- |
| Frontend       | `frontend`            | Auto-detected as Next.js. ESLint runs at monorepo root instead of during build. |
| Admin Frontend | `admin-frontend`      | Vite static build (`npm run build` → `dist/`).                                  |
| Backend        | `backend`             | Serverless function via `backend/api/index.ts` (lazy NestJS init, singleton).   |

In production the backend CORS entry allows all origins (`origin: true`) because both customer and admin frontends are served from different Vercel domains. Locally, CORS is restricted to `FRONTEND_URL` + `ADMIN_FRONTEND_URL`.

## Documentation

- [CLAUDE.md](CLAUDE.md) — Claude Code instructions and architecture reference
- [documents/FEAT-1/plans/prd.md](documents/FEAT-1/plans/prd.md) — Customer shop product requirements
- [documents/FEAT-1/plans/design-token.md](documents/FEAT-1/plans/design-token.md) — Design token system
- [documents/FEAT-1/development/](documents/FEAT-1/development/) — Customer shop implementation docs (DB schema, API specs, auth flows, E2E tests)
- [documents/FEAT-5/plans/prd.md](documents/FEAT-5/plans/prd.md) — Admin backoffice product requirements
- [documents/FEAT-5/development/](documents/FEAT-5/development/) — Admin backoffice implementation docs (shared types, DB schema, backend API, admin-frontend)

## License

MIT
