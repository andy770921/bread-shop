# Papa Bakery — Online Shop

An online bakery storefront for Papa Bakery (周爸烘焙坊). Customers can browse products, manage a shopping cart, and place orders via LINE messaging. Supports guest shopping with seamless cart merge on login, bilingual UI (Chinese/English), and light/dark themes.

## Production

| App      | URL                               |
| -------- | --------------------------------- |
| Frontend | https://papa-bread.vercel.app     |
| Backend  | https://papa-bread-api.vercel.app |

## Tech Stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | Next.js 15 (App Router), shadcn/ui, Tailwind CSS v4, TanStack Query v5 |
| Backend  | NestJS 11, class-validator, Swagger |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| Auth     | Supabase Auth (email/password + LINE Login OAuth2) |
| Payment  | LINE Messaging API (order via chat), credit-card service placeholder in cart UI |
| Monorepo | npm workspaces + Turborepo |
| Shared   | `@repo/shared` — TypeScript types for API contracts |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp backend/.env.example backend/.env       # fill in Supabase + LINE credentials
cp frontend/.env.example frontend/.env.local

# 3. Start development servers
npm run dev
# Frontend: http://localhost:3001
# Backend:  http://localhost:3000 (Swagger UI)
```

## Environment Setup

### Backend (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in credentials. Key variables:

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Supabase project credentials |
| `FRONTEND_URL` | Frontend origin (e.g. `http://localhost:3001`) |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` | LINE Login channel credentials |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API channel token |
| `LINE_ADMIN_USER_ID` | LINE user ID of the shop admin (see below) |

### Frontend (`frontend/.env.local`)

Copy `frontend/.env.example` to `frontend/.env.local`. The only required variable is `NEXT_PUBLIC_API_URL=http://localhost:3000`.

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

## Architecture

```
Browser ─── Next.js (:3001) ── rewrites /api/* ──→ NestJS (:3000) ──→ Supabase
               │                                        │
         shadcn/ui + TanStack Query            SessionMiddleware
         AuthProvider (JWT in localStorage)     SupabaseService (service key)
         next-themes (dark mode)               class-validator (DTOs)
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
│   ├── i18n/                 # zh.json + en.json translation files
│   └── hooks/                # useLocale()
├── backend/src/
│   ├── auth/                 # Login, register, LINE OAuth, session merge
│   ├── product/              # Product listing and detail
│   ├── category/             # Category listing
│   ├── cart/                 # Server-side cart CRUD
│   ├── favorite/             # User favorites
│   ├── order/                # Order creation, history, status
│   ├── line/                 # LINE push message for orders
│   ├── user/                 # Profile management
│   ├── supabase/             # Global Supabase client provider
│   └── common/               # Session middleware, decorators, guards
├── shared/src/types/         # Product, Cart, Order, Auth, User, Favorite types
└── documents/FEAT-1/         # PRD, design tokens, DB schema, API specs, test plans
```

## Database

8 tables in Supabase PostgreSQL: `profiles`, `categories`, `products`, `sessions`, `cart_items`, `favorites`, `orders`, `order_items`.

Product images stored in Supabase Storage (public bucket `product-images`). Seeded with 5 categories and 6 products.

## Commands

```bash
npm run dev              # Start both servers
npm run build            # Build all workspaces
npm run test             # Run all tests
npm run lint             # Lint all code
```

## Documentation

- [CLAUDE.md](CLAUDE.md) — Claude Code instructions and architecture reference
- [documents/FEAT-1/plans/prd.md](documents/FEAT-1/plans/prd.md) — Product requirements
- [documents/FEAT-1/plans/design-token.md](documents/FEAT-1/plans/design-token.md) — Design token system
- [documents/FEAT-1/development/](documents/FEAT-1/development/) — Implementation docs (DB schema, API specs, auth flows, E2E tests)

## License

MIT
