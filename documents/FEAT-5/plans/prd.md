# PRD: Admin Backoffice (admin-frontend)

**Ticket:** FEAT-5
**Status:** Planning
**Created:** 2026-04-17

## Problem Statement

The Papa Bakery owner has no self-service admin UI. Every product update (new items, price/image changes, delisting, stock adjustments), website copy change (zh / en), and order status transition must currently be done by an engineer — either in the Supabase dashboard or in the frontend i18n JSON followed by a redeploy.

This creates three problems:

1. **Operations are blocked on engineering.** The owner cannot independently add new products, swap a seasonal image, or tweak copy.
2. **No reliable order management view.** The owner currently reconciles orders via LINE messages; there is no status flow (pending → paid → preparing → shipping → delivered).
3. **Copy is hardcoded in frontend JSON.** Changing a single homepage headline requires a PR, CI run, and Vercel redeploy.

## Solution Overview

Add a new standalone frontend workspace — **`admin-frontend`** — to the Turbo monorepo (Next.js, port 3002), deployed as a separate Vercel project (future domain e.g. `admin.papabakery.com`). Add admin-only modules / controllers / guards to the existing NestJS backend; all admin endpoints live under `/api/admin/*`.

Authorization reuses Supabase Auth + Bearer JWT. A new `role` column on `profiles` (`'customer' | 'admin' | 'owner'`) gates admin API access. After login, the admin frontend calls `GET /api/admin/me`; the backend checks `profiles.role` and returns 403 for customer-role accounts.

Product data: all fields are editable from the admin. Website copy: a new `site_content` table stores editable i18n overrides that the customer frontend merges on top of the static JSON defaults. Image uploads use Supabase Storage signed upload URLs — the browser uploads directly to the bucket; the backend only mints URLs and never proxies the binary.

## Goals / Success Criteria

- The owner can, without involving engineers, create new products, upload product images, adjust stock, edit the homepage banner, and process orders.
- The customer frontend (`frontend`, port 3001) continues to work unchanged — when `site_content` rows exist they override i18n; otherwise the JSON defaults are used.
- Any non-admin token hitting an admin endpoint is rejected at the guard layer (`403 Forbidden`).
- When a product's `stock_quantity` hits 0, the customer frontend disables "Add to cart" for that item.

## Non-Goals (Out of Scope)

- Fine-grained role split beyond owner/admin (there is a single owner today; the `admin` role is reserved but no invite UI is shipped).
- Audit log of admin actions — rely on `updated_at` for now.
- SSO between customer and admin frontends — they log in independently; no shared session.
- Advanced reporting / BI dashboards — the dashboard overview shows basic KPIs and aggregates from existing DB data, but no time-series charts, CSV exports, or custom date-range analytics.
- Stock deduction on order creation — `stock_quantity` is managed manually by the admin. Automatic decrement on checkout is out of scope for v1.
- Multi-language admin UI — `admin-frontend` is Chinese-only for the owner, but the content it edits is bilingual (zh / en).
- Email / SMS customer notifications on status change.

## User Stories

### US-1 Login / Authorization

1. As the owner, I log in to `admin.papabakery.com` with email + password and land on the dashboard overview.
2. As the owner, refreshing the page does not log me out (Bearer JWT in `localStorage`; `/api/admin/me` re-verifies).
3. As the system, when a customer-role account tries to log in to the admin frontend, the backend returns `403 Forbidden` and the frontend shows "This account has no admin access".
4. As the owner, I can log out — the button clears the token and returns me to the login page.

### US-5 Dashboard Overview

22. As the owner, after login I land on a dashboard showing key business metrics derived from existing DB data: today's order count, today's revenue, pending orders count, and low-stock product count.
23. As the owner, I see a recent orders table (last 10) on the dashboard for a quick operational overview.
24. As the owner, I see a top-selling products list (by order quantity) so I know which items are popular.
25. As the owner, I see an orders-by-status breakdown so I can gauge the processing pipeline at a glance.

**Note:** The dashboard uses only existing DB tables (`orders`, `order_items`, `products`). No new analytics tables or external data sources are required. KPI "vs last week" percentages shown in the design mockup are calculated at query time.

### US-2 Product Management

5. As the owner, I see a list of all products (including delisted), with thumbnail, name, category, price, stock, and active flag.
6. As the owner, I can create a new product: zh / en name and description, category, price, image upload, stock, badge, sort order, active flag.
7. As the owner, I can open an existing product, edit any field, and save.
8. As the owner, I can soft-delete a product (`is_active = false`) — the customer frontend stops listing it but the row stays.
9. As the owner, I can hard-delete a product, but only if it has **no `order_items` rows**. Otherwise the backend returns `409 Conflict` and recommends soft-delete instead.
10. As the owner, the edit page lets me drag-and-drop an image to upload to Supabase Storage; `image_url` is updated on save.
11. As the owner, I can quick-edit stock directly in the list (±1 buttons or inline input) without opening the detail page.

### US-3 Site Content Management

12. As the owner, I see all editable copy keys, grouped by section (home, banner, story, process, categories, …), flattened from the frontend i18n JSON.
13. As the owner, each key has a zh and en input (single-line `<input>` or `<textarea>` depending on key length); saving writes to `site_content`.
14. As the owner, I can "reset to default" on a key — the corresponding `site_content` row is deleted, and the frontend falls back to the JSON default.
15. As the customer frontend, on load I fetch `/api/site-content` once and merge overrides onto the JSON defaults; missing overrides silently fall back.
16. **The admin UI does not allow creating new i18n keys**, only editing existing ones. This prevents the owner from breaking the schema (e.g. deleting `nav.login` and crashing the frontend).

### US-4 Order Management

17. As the owner, I see all orders newest-first, filterable by status (pending / paid / preparing / shipping / delivered / cancelled).
18. As the owner, I can open an order to see: customer info, LINE ID, notes, ordered items (with qty, unit price, line subtotal), total, payment method, created_at.
19. As the owner, I can update order status via a dropdown.
20. As the owner, I can trigger a re-send of the LINE order-confirmation Flex Message, reusing the existing `LineService`.
21. As the system, status transitions use a **relaxed state machine** — most transitions are allowed, but obviously invalid ones are blocked (e.g. `cancelled → delivered`). See `backend-api.md` for the full allowed-transitions table.

## Implementation Decisions

### High-Level Architecture

```
monorepo/
├── frontend/          # Customer site, port 3001 (unchanged)
├── admin-frontend/    # Admin backoffice, port 3002 (new)
├── backend/           # Same NestJS instance; add admin module
│   └── src/admin/     # new: ProductAdmin, ContentAdmin, OrderAdmin, UploadAdmin
├── shared/            # @repo/shared — extend with admin / site_content types
```

**Shared between `admin-frontend` and `frontend`:**

- `@repo/shared` types
- The backend (same NestJS instance; different route prefix)
- Supabase Storage bucket (`product-images`)

**Not shared:**

- Cookies / session (admin does not use `session_id`; only Bearer JWT)
- Tailwind theme / design tokens (admin uses a neutral gray + functional palette, not the storefront look)
- i18n (admin is zh-only)

### Deep Modules

| Module                     | Purpose                                                                              | Interface                                                        |
| -------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `AdminAuthGuard` (BE)      | Verify JWT and check `profiles.role ∈ {'admin','owner'}`. Single purpose.            | `canActivate(ctx)`                                               |
| `ProductAdminService` (BE) | Product CRUD + soft-delete + guarded hard-delete (FK check against `order_items`).   | `list / create / update / softDelete / hardDelete / updateStock` |
| `ContentAdminService` (BE) | `site_content` CRUD + returns the schema of editable keys.                           | `listKeys / upsert / remove / getAll`                            |
| `OrderAdminService` (BE)   | Order list / detail / status update / resend LINE push.                              | `list / detail / updateStatus / resendLine`                      |
| `UploadAdminService` (BE)  | Mint a Supabase Storage signed upload URL (browser uploads direct to bucket).        | `createSignedUploadUrl(filename, contentType)`                   |
| `SiteContentProvider` (FE) | Customer frontend fetches `/api/site-content` once and merges into the i18n context. | `useLocalizedText(key)`                                          |

### Auth Flow

```
Admin FE login page
  → POST /api/auth/login  (existing endpoint, unchanged)
  → { access_token, user }
  → Admin FE calls GET /api/admin/me
      → AdminAuthGuard verifies role
      → 200 { id, email, role }   or   403 Forbidden
  → 200: store token → redirect to /dashboard
  → 403: show "no admin access"
```

**Why reuse `/api/auth/login`:** one set of password hashing and rate limiting; the owner likely already has a customer account. Role enforcement is applied per admin endpoint, not at login.

**Why Bearer (not cookies):** admin and customer frontends deploy under different domains; sharing cookies would require extra CORS plumbing. Bearer in `localStorage` is already the customer frontend's pattern — reuse it.

### APIs / Interfaces

All admin endpoints live under `/api/admin/*`, behind `AdminAuthGuard`.

| Method | Path                                | Purpose                                                 |
| ------ | ----------------------------------- | ------------------------------------------------------- |
| GET    | `/api/admin/me`                     | Liveness check; returns `{id, email, role}`             |
| GET    | `/api/admin/dashboard`              | Aggregated stats (KPIs, recent orders, top products)    |
| GET    | `/api/admin/products`               | All products (including inactive)                       |
| POST   | `/api/admin/products`               | Create                                                  |
| PATCH  | `/api/admin/products/:id`           | Update                                                  |
| PATCH  | `/api/admin/products/:id/stock`     | Quick stock update (integer delta or absolute)          |
| DELETE | `/api/admin/products/:id`           | Hard delete; 409 if `order_items` reference it          |
| POST   | `/api/admin/uploads/product-image`  | Returns signed upload URL + final public URL            |
| GET    | `/api/admin/site-content`           | All override rows (for the admin editor)                |
| PUT    | `/api/admin/site-content/:key`      | Upsert a single key                                     |
| DELETE | `/api/admin/site-content/:key`      | Remove override (revert to default)                     |
| GET    | `/api/admin/orders`                 | Order list; supports `?status=`, `?page=`               |
| GET    | `/api/admin/orders/:id`             | Order detail                                            |
| PATCH  | `/api/admin/orders/:id/status`      | Update status                                           |
| POST   | `/api/admin/orders/:id/resend-line` | Re-push LINE Flex message                               |
| GET    | `/api/site-content`                 | **Public** — customer frontend reads overrides, no auth |

### Database Changes

```sql
-- 1. profiles.role
ALTER TABLE profiles
  ADD COLUMN role text NOT NULL DEFAULT 'customer'
  CHECK (role IN ('customer', 'admin', 'owner'));

-- One-off bootstrap of owner
UPDATE profiles SET role = 'owner' WHERE email = '<owner-email>';

-- 2. products.stock_quantity
ALTER TABLE products
  ADD COLUMN stock_quantity integer NOT NULL DEFAULT 0
  CHECK (stock_quantity >= 0);

-- 3. site_content
CREATE TABLE site_content (
  key        text PRIMARY KEY,              -- e.g. "home.title"
  value_zh   text,
  value_en   text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);
```

Detailed migration / RLS in `development/database-schema.md`.

### Frontend Structure (`admin-frontend`)

**Note:** `admin-frontend` uses **Vite + React + react-router-dom** (not Next.js). See `admin-frontend.md` for rationale.

```
admin-frontend/
├── package.json           # name: admin-frontend, port 3002
├── vite.config.ts         # proxy /api/* → backend; Vite alias for @/
├── index.html             # Vite entry HTML
├── src/
│   ├── main.tsx                        # React entry point
│   ├── App.tsx                         # Router setup (react-router-dom)
│   ├── routes/
│   │   ├── Login.tsx                   # Login page (/)
│   │   └── dashboard/
│   │       ├── DashboardLayout.tsx     # Sidebar + header; route-guarded
│   │       ├── DashboardIndex.tsx      # Overview page (KPIs, recent orders, top products)
│   │       ├── products/
│   │       │   ├── ProductList.tsx     # List
│   │       │   ├── ProductNew.tsx      # Create
│   │       │   └── ProductEdit.tsx     # Edit (:id)
│   │       ├── content/
│   │       │   └── ContentEditor.tsx   # Content editor, grouped tabs
│   │       └── orders/
│   │           ├── OrderList.tsx       # Orders list
│   │           └── OrderDetail.tsx     # Order detail (:id)
│   ├── components/ui/                  # shadcn/ui (separate from frontend)
│   ├── lib/
│   │   ├── admin-fetchers.ts           # wires adminTokenStore into shared fetchApi
│   │   ├── admin-auth-context.tsx
│   │   ├── admin-auth-guard.tsx        # route-level redirect
│   │   └── admin-token-store.ts        # localStorage wrappers
│   ├── queries/
│   │   ├── useAdminDashboard.ts
│   │   ├── useAdminProducts.ts
│   │   ├── useSiteContent.ts
│   │   └── useAdminOrders.ts
│   └── i18n/                           # zh-only
```

### Key Design Decisions

| #   | Decision                                                                                                       | Rationale                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D1  | Reuse Supabase Auth; distinguish admins via `profiles.role`.                                                   | Avoids a second auth stack; the owner probably already has a customer account.                |
| D2  | `admin-frontend` is a separate Vercel project on its own domain.                                               | Customer bundle stays small; CORS / CSP are isolated; deploys don't block each other.         |
| D3  | Image upload via Supabase signed upload URL (direct browser → bucket).                                         | Avoids Vercel's 10s function timeout and body-size limits.                                    |
| D4  | Copy stored in DB (`site_content`); customer frontend merges overrides onto JSON defaults.                     | Copy edits don't require redeploy; JSON defaults are a safety net if the override is missing. |
| D5  | Admin UI only edits existing i18n keys; it does not create or delete keys.                                     | Prevents the owner from accidentally removing a required key and crashing the frontend.       |
| D6  | Relaxed order state-machine for admin (block only obviously invalid transitions like `cancelled → delivered`). | Gives the owner flexibility while preventing accidental nonsense transitions.                 |
| D7  | Default delete is soft (`is_active = false`); hard delete is allowed only when no `order_items` reference.     | Preserves historical product data on past orders.                                             |
| D8  | `admin-frontend` does not import `frontend/` components or providers.                                          | Keeps the two apps decoupled; they only share `@repo/shared` types.                           |
| D9  | Old product images are deleted from Supabase Storage when the admin uploads a replacement.                     | Prevents orphaned files from accumulating in the storage bucket.                              |
| D10 | Content editor key list is derived at build time by importing `frontend/src/i18n/zh.json` via Vite alias.      | Zero-maintenance sync — new keys in zh.json automatically appear in the admin content editor. |
| D11 | Dashboard overview uses a single backend endpoint that aggregates existing DB data (orders, products).         | No new tables or data pipelines; keeps the feature lightweight.                               |

## Testing Strategy

### Backend (Jest unit + e2e)

- `AdminAuthGuard` unit: no token / token with `role=customer` / token with `role=owner` — three cases.
- `ProductAdminService.hardDelete`: throws `ConflictException` when referenced by `order_items`.
- `ContentAdminService.upsert`: idempotent on existing key.
- E2E: `POST /api/admin/products` with customer token → 403; with owner token → 201.
- E2E: unauthenticated `GET /api/site-content` returns the public overrides.

### Admin Frontend (Jest + React Testing Library)

- `admin-auth-guard`: unauthenticated → redirect to `/`.
- Product form: required-field errors appear on submit.
- Image upload flow: mocked signed-URL endpoint → expects `PUT` to bucket URL → verifies `image_url` in form state is updated.

### Manual QA (pre-release)

1. Owner logs in, creates a new product (with image), and confirms it appears on the customer frontend.
2. Set a product's stock to 0; confirm "Add to cart" is disabled on the customer frontend.
3. Edit `home.title`, save, refresh the customer frontend — new copy is shown.
4. Delete the override, refresh — JSON default is restored.
5. Log in to admin-frontend with a customer account → "no admin access" message is shown.

## Open Questions

- **Q1:** Does the admin frontend need IP allowlisting or MFA? → Not in scope. Add MFA later if the owner's account is compromised.
- **Q2:** The `product-images` bucket is **public**. What is the upload filename convention? → Proposal: `products/{product_id}-{timestamp}.{ext}`, generated by `UploadAdminService.createSignedUploadUrl` to avoid collisions.
- **Q3:** Cache strategy for `site_content`? → Start with TanStack Query `staleTime: 60s` on the customer frontend. ISR + ETag can come later.
- **Q4:** How is the owner account bootstrapped? → One-off `UPDATE profiles SET role='owner' WHERE email=?` via Supabase SQL Editor. A backend bootstrap script is optional.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete

## Related Documents

- `documents/FEAT-5/development/database-schema.md`
- `documents/FEAT-5/development/backend-api.md`
- `documents/FEAT-5/development/admin-frontend.md`
- `documents/FEAT-5/development/shared-types.md`
- FE design mockups: TBD (user will provide later)
