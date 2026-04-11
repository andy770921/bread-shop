# PRD: Papa Bakery (Zhou Ba Hong Bei Fang) — Online Shop

## Problem Statement

Papa Bakery needs an online shopping website where customers can browse, select, and purchase bread and bakery products. Customers should be able to pay via credit card (Lemon Squeezy) or send their order to the shop's LINE Official Account. The site must support both guest and authenticated shopping — guests who log in after adding items to their cart must retain those items seamlessly.

## Solution Overview

Built on the existing Next.js + NestJS monorepo, the following feature modules will be added:

1. **Supabase Auth** integration for login/registration (Email + LINE Login)
2. **Server-side cart**: session cookie tracks carts for both guests and members; all operations go through APIs (not localStorage)
3. **Bilingual system** (zh/en): frontend i18n via a locale hook with JSON translation files
4. **Light/dark theme**: CSS custom properties + `.dark` class toggle, integrated with shadcn/ui theming
5. **Favorites**: logged-in users can bookmark products with a heart icon
6. **Checkout**: Lemon Squeezy credit card payment or LINE message-based order submission
7. **Member center**: edit profile (name, phone), view order history, and track order status

---

## User Stories

### Guest

1. As a guest, I want to browse all bakery products so that I can find something I like.
2. As a guest, I want to filter products by category so that I can narrow down my choices.
3. As a guest, I want to switch between grid view and editorial view so that I can see products differently.
4. As a guest, I want to add products to my cart so that I can purchase them later.
5. As a guest, I want to view my cart, adjust quantities, and remove items so that I can finalize my order.
6. As a guest, I want to checkout and pay with a credit card (Lemon Squeezy) without logging in.
7. As a guest, I want to send my order via LINE to the shop's official account as an alternative to online payment.
8. As a guest, I want to switch the website language between Chinese and English.
9. As a guest, I want to toggle between light and dark mode.

### Authenticated User

10. As a user, I want to register and login with email/password so that I can access member features.
11. As a user, I want to login via LINE so that I can use my LINE account.
12. As a user, I want my guest cart items to merge into my account cart after logging in so that I don't lose my selections.
13. As a user, I want to mark products as favorites (heart icon) so that I can find them quickly later.
14. As a user, I want to edit my profile (name, phone) so that my info is correct for orders.
15. As a user, I want to view my order history so that I can track past purchases.
16. As a user, I want to track the status of my orders (pending -> paid -> preparing -> shipping -> delivered).

---

## Technical Challenges & Solutions

### Challenge A: Guest + Authenticated Cart Coexistence

**Problem**: Both guests and logged-in users can add to cart. When a guest logs in, their cart items must persist.

**Solution — Session-based Cart**:

1. Every visitor gets a `session_id` cookie (HttpOnly, SameSite=Lax, 30-day expiry).
2. A `sessions` table maps `session_id` to `user_id` (nullable for guests).
3. Cart items are linked to `session_id`, not directly to `user_id`.
4. On login:
   - The current session's `user_id` is set to the logged-in user.
   - If the user has items in an older session (from a previous device/browser), those items are merged into the current session.
   - Merge rule: same product -> sum quantities; different product -> move to current session.
   - Old sessions are deleted after merge.
5. On logout:
   - Session cookie remains, but `user_id` is cleared.
   - Cart items stay in the session (user can continue as guest).

**Cart resolution**:
- **Guest**: `SELECT cart_items WHERE session_id = cookie.session_id`
- **Authenticated**: `SELECT cart_items WHERE session_id IN (SELECT id FROM sessions WHERE user_id = current_user)`

### Challenge B: Server-side Cart (Why Not localStorage?)

**Problem**: Storing cart in localStorage is vulnerable to tampering — users could modify prices, quantities, or inject invalid product IDs.

**Solution — API-mediated Cart**:

1. All cart operations go through backend APIs:
   - `POST /api/cart/items` — validates product exists, is active, uses DB price (not client-submitted price)
   - `PATCH /api/cart/items/:id` — validates quantity > 0
   - `DELETE /api/cart/items/:id` — removes item
   - `GET /api/cart` — returns items with **server-computed** prices and totals

2. **Server computes all pricing**: The backend joins `cart_items` with `products` to get current prices. Even if a product's price changes between "add to cart" and "checkout", the user sees the correct, up-to-date price.

3. **Stock validation**: Server can check product availability (future enhancement).

4. **Cross-device sync**: Because carts live in the DB, a logged-in user sees the same cart on any device.

5. **Session cookie security**: `HttpOnly` prevents JS access; `SameSite=Lax` prevents CSRF; cookie only contains a UUID (no sensitive data).

---

## Implementation Decisions

### Modules

| Module | Purpose | Interface |
|--------|---------|-----------|
| **SupabaseModule** | Supabase client provider for NestJS | `SupabaseService.getClient()` |
| **AuthModule** | Email/password + LINE Login, JWT guard | `AuthController`, `AuthGuard`, `SessionMiddleware` |
| **ProductModule** | Read-only for products + categories | `GET /api/products`, `GET /api/categories` |
| **CartModule** | Server-side cart operations | `GET/POST/PATCH/DELETE /api/cart/*` |
| **FavoriteModule** | Favorite toggle for authenticated users | `GET/POST/DELETE /api/favorites/*` |
| **OrderModule** | Order creation, history, status tracking | `GET/POST /api/orders/*` |
| **PaymentModule** | Lemon Squeezy checkout + webhook handling | `POST /api/payments/checkout`, webhook endpoint |
| **LineModule** | LINE Login callback + order messaging | `POST /api/orders/:id/line-send` |
| **UserModule** | Profile management | `GET/PATCH /api/user/profile` |

### Architecture

```
+------------------------------------------------------------------+
|                         Frontend (Next.js)                        |
|  +----------+ +----------+ +----------+ +----------+             |
|  | Home Page| |Cart Page | | Profile  | |  Orders  |             |
|  | Products | | Checkout | |  Page    | |  Page    |             |
|  +----+-----+ +----+-----+ +----+-----+ +----+-----+             |
|       |             |            |             |                  |
|  +----+-------------+------------+-------------+------+          |
|  |          TanStack Query + API Client               |          |
|  |    (session cookie auto-attached by browser)       |          |
|  +------------------------+---------------------------+          |
+---------------------------+----------------------------------+
                            | HTTP (credentials: 'include')
+---------------------------+----------------------------------+
|                    Backend (NestJS)                           |
|  +------------------------+---------------------------+      |
|  |              SessionMiddleware                      |      |
|  |  (creates/reads session_id cookie on every req)    |      |
|  +------------------------+---------------------------+      |
|       |             |            |             |              |
|  +----+-----+ +-----+----+ +----+-----+ +----+-----+        |
|  |  Auth    | |  Cart    | | Product  | |  Order   |        |
|  | Module   | | Module   | | Module   | | Module   |        |
|  +----+-----+ +----+-----+ +----+-----+ +----+-----+        |
|       |             |            |             |              |
|  +----+-------------+------------+-------------+------+      |
|  |             Supabase Client (Service Key)           |      |
|  +------------------------+---------------------------+      |
+---------------------------+----------------------------------+
                            |
                    +-------+--------+
                    |   Supabase DB  |
                    |   + Auth       |
                    +----------------+
```

### APIs / Interfaces

See detailed API specifications in `documents/FEAT-1/development/backend-api.md`.

**Summary of all endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | — | Register with email/password |
| POST | /api/auth/login | — | Login with email/password |
| POST | /api/auth/logout | — | Logout, clear auth token |
| GET | /api/auth/me | Bearer | Get current user info |
| GET | /api/auth/line/callback | — | LINE OAuth callback |
| GET | /api/products | — | List products (optional ?category=slug) |
| GET | /api/products/:id | — | Get single product |
| GET | /api/categories | — | List categories |
| GET | /api/cart | Session | Get cart with server-computed totals |
| POST | /api/cart/items | Session | Add item to cart |
| PATCH | /api/cart/items/:id | Session | Update item quantity |
| DELETE | /api/cart/items/:id | Session | Remove item |
| DELETE | /api/cart | Session | Clear entire cart |
| GET | /api/favorites | Bearer | List user's favorites |
| POST | /api/favorites/:productId | Bearer | Add favorite |
| DELETE | /api/favorites/:productId | Bearer | Remove favorite |
| POST | /api/orders | Session | Create order from cart |
| GET | /api/orders | Bearer | List user's orders |
| GET | /api/orders/:id | Bearer | Get order detail |
| POST | /api/payments/checkout | Session | Create Lemon Squeezy checkout URL |
| POST | /api/webhooks/lemon-squeezy | — | Lemon Squeezy payment webhook |
| POST | /api/orders/:id/line-send | Session | Send order via LINE message |
| GET | /api/user/profile | Bearer | Get user profile |
| PATCH | /api/user/profile | Bearer | Update profile (name, phone) |

### Database Schema

See full SQL in `documents/FEAT-1/development/database-schema.md`.

**Tables**: `profiles`, `categories`, `products`, `sessions`, `cart_items`, `favorites`, `orders`, `order_items`

### Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Hero, product grid/editorial, category filter, favorites |
| `/cart` | Cart | Cart items, customer form, order summary, checkout |
| `/profile` | Profile | Edit name/phone (auth required) |
| `/orders` | Orders | Order history list (auth required) |
| `/orders/[id]` | Order Detail | Single order with status tracking (auth required) |
| `/auth/login` | Login | Email + LINE login |
| `/auth/register` | Register | Email registration |
| `/checkout/success` | Success | Post-payment success page |

---

## Testing Strategy

### Backend
- **Unit tests**: Each service method tested with mocked Supabase client
- **E2E tests**: Full HTTP request cycle for critical flows (cart operations, order creation)
- **Webhook tests**: Lemon Squeezy webhook signature verification

### Frontend
- **Component tests**: Jest + React Testing Library for key components
- **Integration tests**: TanStack Query hooks with MSW (Mock Service Worker)
- **Manual testing**: Browser-based testing for i18n, dark mode, responsive design

---

## Out of Scope

- Admin panel / CMS for managing products (products managed directly in Supabase)
- Inventory / stock management
- Shipping tracking integration (status updated manually)
- Email notifications
- Social login providers other than LINE
- Mobile app (responsive web only)
- Search functionality (category filter only)
- Product reviews / ratings
- Coupon / discount system

---

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
