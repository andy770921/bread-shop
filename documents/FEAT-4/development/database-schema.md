# Implementation Plan: Database Schema

## Overview

This implementation covers the persistence layer for the `/cart` customer-info draft.

The goal is to add one mutable, session-scoped draft record that:

- is keyed by the existing `session_id`
- stores only the fields needed to restore cart progress
- expires automatically through an `expires_at` boundary
- can be deleted explicitly after successful checkout or cart reset

This draft is intentionally separate from `pending_line_orders`.

## Files to Modify

### Database Changes

- `supabase/migrations/0001_create_checkout_contact_drafts.sql`
  - Create `checkout_contact_drafts`
  - Add unique constraint on `session_id`
  - Add `expires_at` and `updated_at`
  - Add indexes for `session_id` and `expires_at`
  - Reuse the existing `updated_at` trigger pattern if one already exists in the DB

### Shared Types

- `shared/src/types/cart.ts`
  - Add the public draft response/request types used by frontend and backend

## Step-by-Step Implementation

### Step 1: Apply migration via Supabase MCP

**Tool:** Supabase MCP `apply_migration` or `execute_sql`

**Changes:**

- Use the Supabase MCP tool to apply the migration directly to the connected project.
- The repository does not have a checked-in `supabase/migrations/` directory. This feature applies schema changes via MCP, consistent with how previous tables were created.

**Rationale:** The project manages its Supabase schema through MCP tooling, not local CLI migrations. Using MCP keeps the workflow consistent and avoids introducing a migration directory that the rest of the project does not use.

### Step 2: Create `checkout_contact_drafts`

**Changes:**

- Create a new table with one row per active browser session.

Suggested shape:

```sql
create table public.checkout_contact_drafts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  customer_name text null,
  customer_phone text null,
  customer_email text null,
  customer_address text null,
  notes text null,
  payment_method text null,
  line_id text null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Rationale:** The draft belongs to the session boundary, not to the durable order boundary. A dedicated table avoids mixing autosaved form progress with submit-time checkout artifacts.

### Step 3: Add constraints and indexes

**Changes:**

- Add a unique index on `session_id`
- Add an index on `expires_at`
- Add a simple check constraint for `payment_method`

Suggested additions:

```sql
create unique index checkout_contact_drafts_session_uidx
  on public.checkout_contact_drafts(session_id);

create index checkout_contact_drafts_expires_idx
  on public.checkout_contact_drafts(expires_at);

alter table public.checkout_contact_drafts
  add constraint checkout_contact_drafts_payment_method_chk
  check (
    payment_method is null
    or payment_method in ('credit_card', 'line_transfer')
  );
```

**Rationale:** `session_id` must map to at most one mutable draft. `expires_at` needs an index because reads will filter by expiration. The payment-method constraint prevents drift between DB and application enums.

### Step 4: Add `updated_at` trigger (reuse existing function)

**Changes:**

- The database already has a shared trigger function `public.set_updated_at()` applied to `profiles`, `products`, `cart_items`, `orders`, and `sessions`.
- Attach the same function to `checkout_contact_drafts`:

```sql
create trigger tr_checkout_contact_drafts_updated_at
  before update on public.checkout_contact_drafts
  for each row execute function public.set_updated_at();
```

**Rationale:** Autosave updates should refresh `updated_at` automatically. The existing `set_updated_at()` function is already proven across five tables — no need to create a new one.

### Step 5: Define expiry behavior

**Changes:**

- Do not rely on database cron as a phase-1 requirement.
- Treat expiry as application-enforced first:
  - reads only return rows where `expires_at > now()`
  - upserts always set `expires_at = now() + interval '24 hours'`

Optional later enhancement:

- add scheduled purge if the deployment platform supports DB cron or janitor jobs

**Rationale:** Functional correctness should not depend on infra that is not yet checked into this repository. The unique index still allows an expired row to be refreshed in place by an upsert.

## Testing Steps

1. Apply the migration in a dev database and confirm the table is created with the expected constraints.
2. Insert two rows with the same `session_id` and verify the unique index blocks the second direct insert.
3. Insert a row with an invalid `payment_method` and verify the check constraint rejects it.
4. Update an existing row and verify `updated_at` changes automatically.
5. Verify a query filtered by `expires_at > now()` ignores expired rows.

## Dependencies

- Must complete before: backend contact-draft API work
- Depends on: existing `sessions` table and UUID generation support in the DB

## RLS and Access Control

- RLS is enabled on all project tables but bypassed by the service role key used in the backend.
- No RLS policies are needed for `checkout_contact_drafts` in phase 1 — the backend service role handles all access.
- If direct client access is ever added, row-level policies scoped by `session_id` or `user_id` should be created at that time.

## Complete Migration SQL

The following SQL is ready to execute via Supabase MCP `execute_sql` in a single call:

```sql
-- 1. Create table
create table public.checkout_contact_drafts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  customer_name text null,
  customer_phone text null,
  customer_email text null,
  customer_address text null,
  notes text null,
  payment_method text null,
  line_id text null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Unique constraint: one draft per session
create unique index checkout_contact_drafts_session_uidx
  on public.checkout_contact_drafts(session_id);

-- 3. Index for expiry filtering
create index checkout_contact_drafts_expires_idx
  on public.checkout_contact_drafts(expires_at);

-- 4. Payment method allow-list
alter table public.checkout_contact_drafts
  add constraint checkout_contact_drafts_payment_method_chk
  check (
    payment_method is null
    or payment_method in ('credit_card', 'line_transfer')
  );

-- 5. Reuse existing updated_at trigger function
create trigger tr_checkout_contact_drafts_updated_at
  before update on public.checkout_contact_drafts
  for each row execute function public.set_updated_at();
```

## Notes

- Keep draft fields as explicit columns instead of a generic JSON blob.
  - This makes validation, redaction, future encryption, and selective retention easier.
- Do not store any payment-card fields in this table.
- `pending_line_orders` remains unchanged in this feature. It is a later checkout artifact, not a mutable cart-page draft.
