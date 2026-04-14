# Race Condition DB Revamp

## Objective

Move the system from the current model:

- `sessions + cart_items` as the cart persistence layer
- optimistic frontend updates with delayed writes
- checkout safety that sometimes depends on a frontend snapshot
- `pending_line_orders` as a draft-like compatibility layer

to a cleaner ecommerce model:

- server-authoritative cart
- explicit checkout draft
- order created from an immutable draft
- clear DB ownership for cart state, checkout state, and order state

## Architectural Position

For the currently implemented fix, no Supabase migration is required.

For the full architecture revamp, a DB redesign is recommended.

The target direction is:

- `carts`
- `cart_lines`
- `checkout_drafts`

I also recommend one additional table:

- `checkout_draft_items`

That extra table is not strictly required, but it makes the draft immutable, auditable, and easier to transform into `orders + order_items`.

## Design Principles

### 1. The cart must be server-authoritative

The frontend may still render optimistically, but the database must be the source of truth.

### 2. Checkout must freeze a versioned snapshot

Once the user starts checkout, the system should create a draft from one cart version. Order creation should use that draft, not the live cart.

### 3. Orders must be idempotent

Submitting the same checkout twice must not create duplicate orders.

### 4. Login and session merge must be first-class flows

Guest carts, authenticated carts, and LINE-linked users must converge on one cart ownership model.

### 5. Compatibility should be phased

The system should not jump directly from `cart_items` to the final model in one release.

## Target Data Model

### A. `carts`

One row per active cart.

Suggested columns:

- `id uuid primary key`
- `session_id uuid null references sessions(id)`
- `user_id uuid null references auth.users(id)`
- `status text not null`
- `version integer not null default 0`
- `currency text not null default 'TWD'`
- `item_count integer not null default 0`
- `subtotal integer not null default 0`
- `shipping_fee integer not null default 0`
- `total integer not null default 0`
- `last_activity_at timestamptz not null default now()`
- `checked_out_at timestamptz null`
- `merged_into_cart_id uuid null references carts(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested status values:

- `active`
- `checked_out`
- `merged`
- `abandoned`

### B. `cart_lines`

One row per product inside one cart.

Suggested columns:

- `id uuid primary key`
- `cart_id uuid not null references carts(id) on delete cascade`
- `product_id integer not null references products(id)`
- `quantity integer not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- unique `(cart_id, product_id)`
- `quantity > 0`
- `quantity <= 99`

### C. `checkout_drafts`

One immutable checkout attempt boundary.

Suggested columns:

- `id uuid primary key`
- `cart_id uuid not null references carts(id)`
- `cart_version integer not null`
- `user_id uuid null references auth.users(id)`
- `line_user_id text null`
- `status text not null`
- `channel text not null default 'line'`
- `form_data jsonb not null default '{}'::jsonb`
- `pricing_snapshot jsonb not null`
- `idempotency_key text not null`
- `failure_reason text null`
- `expires_at timestamptz not null`
- `confirmed_at timestamptz null`
- `submitted_at timestamptz null`
- `completed_at timestamptz null`
- `order_id integer null references orders(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested status values:

- `pending_auth`
- `awaiting_friendship`
- `ready_to_confirm`
- `submitting`
- `completed`
- `expired`
- `failed`

### D. `checkout_draft_items`

Frozen line items captured from the cart at draft creation time.

Suggested columns:

- `id uuid primary key`
- `checkout_draft_id uuid not null references checkout_drafts(id) on delete cascade`
- `product_id integer not null references products(id)`
- `product_name_zh text not null`
- `product_name_en text not null`
- `product_price integer not null`
- `quantity integer not null`
- `line_total integer not null`
- `product_snapshot jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

### E. Additions to `orders`

Suggested additions:

- `checkout_draft_id uuid null references checkout_drafts(id)`
- `idempotency_key text null`

Purpose:

- link every order to the draft that produced it
- prevent duplicate creation from retries

## Phase Plan

## Phase 1: Introduce Server-Authoritative Cart Tables

### Goal

Create `carts` and `cart_lines` alongside the current `cart_items` model so the codebase can begin a phased cutover.

### Migration Draft

```sql
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid null references public.sessions(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'checked_out', 'merged', 'abandoned')),
  version integer not null default 0,
  currency text not null default 'TWD',
  item_count integer not null default 0,
  subtotal integer not null default 0,
  shipping_fee integer not null default 0,
  total integer not null default 0,
  last_activity_at timestamptz not null default now(),
  checked_out_at timestamptz null,
  merged_into_cart_id uuid null references public.carts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index carts_active_session_uidx
  on public.carts(session_id)
  where status = 'active' and session_id is not null;

create unique index carts_active_user_uidx
  on public.carts(user_id)
  where status = 'active' and user_id is not null;

create table public.cart_lines (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id integer not null references public.products(id) on delete restrict,
  quantity integer not null
    check (quantity > 0 and quantity <= 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create index cart_lines_cart_idx on public.cart_lines(cart_id);
create index cart_lines_product_idx on public.cart_lines(product_id);

-- Enable RLS (service role key bypasses, but keeps consistency with existing tables)
alter table public.carts enable row level security;
alter table public.cart_lines enable row level security;

-- Auto-update updated_at triggers (matching existing table pattern)
create trigger handle_carts_updated_at
  before update on public.carts
  for each row execute function moddatetime(updated_at);

create trigger handle_cart_lines_updated_at
  before update on public.cart_lines
  for each row execute function moddatetime(updated_at);
```

Backfill draft:

- create one active `carts` row per active session that currently has `cart_items`
- propagate `sessions.user_id` to `carts.user_id` for sessions that are linked to users
- aggregate existing `cart_items` into `cart_lines`
- compute `item_count`, `subtotal`, `shipping_fee`, `total`
- the backfill should be idempotent (safe to re-run)

### API Change List

- `GET /api/cart`
  - response should add `cart_id`
  - response should add `version`
- `POST /api/cart/items`
  - should write to `carts + cart_lines`
  - should return the authoritative cart and new version
- `PATCH /api/cart/items/:id`
  - should update `cart_lines`
  - should return the authoritative cart and new version
- `DELETE /api/cart/items/:id`
  - should delete from `cart_lines`
  - should return the authoritative cart and new version
- `DELETE /api/cart`
  - should clear `cart_lines` for the active cart, not raw `cart_items`

## Phase 2: Introduce Explicit Checkout Draft Tables

### Goal

Create a real checkout boundary that is separate from the mutable cart.

### Migration Draft

```sql
create table public.checkout_drafts (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete restrict,
  cart_version integer not null,
  user_id uuid null references auth.users(id) on delete set null,
  line_user_id text null,
  status text not null
    check (status in (
      'pending_auth',
      'awaiting_friendship',
      'ready_to_confirm',
      'submitting',
      'completed',
      'expired',
      'failed'
    )),
  channel text not null default 'line',
  form_data jsonb not null default '{}'::jsonb,
  pricing_snapshot jsonb not null,
  idempotency_key text not null,
  failure_reason text null,
  expires_at timestamptz not null,
  confirmed_at timestamptz null,
  submitted_at timestamptz null,
  completed_at timestamptz null,
  order_id integer null references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index checkout_drafts_idempotency_uidx
  on public.checkout_drafts(idempotency_key);

create index checkout_drafts_status_idx
  on public.checkout_drafts(status);

create index checkout_drafts_expires_idx
  on public.checkout_drafts(expires_at);

create table public.checkout_draft_items (
  id uuid primary key default gen_random_uuid(),
  checkout_draft_id uuid not null references public.checkout_drafts(id) on delete cascade,
  product_id integer not null references public.products(id) on delete restrict,
  product_name_zh text not null,
  product_name_en text not null,
  product_price integer not null,
  quantity integer not null check (quantity > 0 and quantity <= 99),
  line_total integer not null,
  product_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (checkout_draft_id, product_id)
);

create index checkout_draft_items_draft_idx
  on public.checkout_draft_items(checkout_draft_id);

create index checkout_drafts_cart_idx
  on public.checkout_drafts(cart_id);

-- Enable RLS
alter table public.checkout_drafts enable row level security;
alter table public.checkout_draft_items enable row level security;

-- Auto-update updated_at trigger
create trigger handle_checkout_drafts_updated_at
  before update on public.checkout_drafts
  for each row execute function moddatetime(updated_at);
```

Compatibility note:

- keep `pending_line_orders` temporarily during rollout
- backfill is not required at first because `checkout_drafts` can start empty and only serve new flows

### API Change List

- `POST /api/checkout/drafts`
  - create a draft from the active cart
  - return `draft_id`, `status`, `expires_at`
- `GET /api/checkout/drafts/:id`
  - return frozen draft details
- `POST /api/checkout/drafts/:id/line/start`
  - replace the orchestration meaning of `POST /api/auth/line/start`
- `POST /api/checkout/drafts/:id/line/confirm`
  - replace `POST /api/auth/line/confirm-order`
- `GET /api/checkout/pending/:id`
  - read from `checkout_drafts`, not `pending_line_orders`

## Phase 3: Link Orders to Drafts and Add Idempotency

### Goal

Make order creation safe under retry, redirect replay, double click, and LINE callback duplication.

### Migration Draft

```sql
alter table public.orders
  add column checkout_draft_id uuid null references public.checkout_drafts(id) on delete set null;

alter table public.orders
  add column idempotency_key text null;

create unique index orders_checkout_draft_uidx
  on public.orders(checkout_draft_id)
  where checkout_draft_id is not null;

create unique index orders_idempotency_uidx
  on public.orders(idempotency_key)
  where idempotency_key is not null;
```

Optional hardening migration:

```sql
alter table public.checkout_drafts
  add column submit_attempts integer not null default 0;
```

### API Change List

- `POST /api/checkout/drafts/:id/submit`
  - becomes the only order-creation endpoint for the storefront checkout
- `POST /api/orders`
  - should no longer accept raw mutable cart input from the storefront
  - should be kept only for internal or admin use if still needed
- `GET /api/orders/:id`
  - should return `checkout_draft_id`

## Phase 4: Cut Over Session Merge and Cart Resolution

### Goal

Move all cart ownership rules from `sessions + cart_items` merge logic to `carts + cart_lines`.

### Migration Draft

No new tables are strictly required here, but the DB state must be updated during cutover:

- backfill `carts.user_id` from current session ownership
- mark merged carts with `status = 'merged'`
- stop creating new business state in `cart_items`

If needed, add a helper column:

```sql
alter table public.carts
  add column source_session_id uuid null references public.sessions(id) on delete set null;
```

### API Change List

- login and register flows should merge carts by `carts.id`, not by raw session rows
- `GET /api/cart` should resolve one active cart for the actor
- frontend no longer needs checkout snapshot fallback for normal operation

## Phase 5: Remove Legacy Checkout and Cart Tables

### Goal

Finish the revamp and remove compatibility paths.

### Migration Draft

After full cutover and data verification:

```sql
drop table if exists public.pending_line_orders;
drop function if exists public.upsert_cart_item(uuid, integer, integer);
drop table if exists public.cart_items;
```

If compatibility columns are no longer needed, remove them in a separate cleanup migration.

### API Change List

- remove `cart_snapshot` from public checkout requests
- remove storefront dependency on `POST /api/auth/line/start`
- route storefront LINE checkout only through `checkout_drafts`
- remove deprecated response branches that exist only for compatibility

## Recommended Rollout Order

1. Phase 1: add `carts + cart_lines`
2. Phase 2: add `checkout_drafts + checkout_draft_items`
3. Phase 3: add draft-to-order linkage and idempotency
4. Phase 4: switch cart ownership and merge behavior
5. Phase 5: remove `cart_items`, `pending_line_orders`, and `upsert_cart_item`

## Expected Outcome

After the DB revamp:

- cart state lives in one authoritative server model
- checkout freezes a cart version into a draft
- orders are created from immutable draft data
- retries become idempotent
- guest, authenticated, and LINE-linked users all use one consistent state machine
