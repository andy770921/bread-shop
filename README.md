# Papa Bakery — Online Shop

An online bakery storefront for Papa Bakery (周爸烘焙坊). Customers can browse products, manage a shopping cart, and check out via credit card or LINE messaging. Supports guest shopping with seamless cart merge on login, bilingual UI (Chinese/English), and light/dark themes.

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
| Payment  | Lemon Squeezy (credit card), LINE Messaging API (order via chat) |
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

- **Lemon Squeezy** — hosted checkout page for credit card payments, with webhook for order status updates
- **LINE messaging** — send order summary as a Flex Message to the shop's LINE Official Account

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
│   ├── payment/              # Lemon Squeezy checkout + webhook
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
