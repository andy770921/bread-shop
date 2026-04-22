# Implementation Plan: Database Schema

## Overview

Supabase PostgreSQL schema changes to support the admin backoffice:

1. `profiles.role` — authorization flag
2. `products.stock_quantity` — inventory
3. `site_content` — copy overrides for i18n

The backend uses the Supabase service role key everywhere, which bypasses RLS. New objects default to "deny everyone except service_role" for writes, and we only open `SELECT` where the customer frontend reads without auth (public `site_content` read).

## Files to Modify

### New Migration (Supabase)

- `supabase/migrations/20260417_add_admin_schema.sql` (timestamp the filename — exact name chosen at apply time)
  - Adds `profiles.role`, `products.stock_quantity`, `site_content` table
  - Adds RLS policies and indexes

### Shared Types

- `shared/src/types/user.ts`
  - `UserProfile` gains `role: UserRole`
- `shared/src/types/product.ts`
  - `Product` gains `stock_quantity: number`
- `shared/src/types/admin.ts` (new)
  - Exports `UserRole` and `SiteContentEntry`

See `shared-types.md` for details.

## Step-by-Step Implementation

### Step 1: Add `profiles.role`

**Why:** Mark admin identity. Reuses Supabase Auth; avoids building a separate `admin_users` table.

```sql
ALTER TABLE public.profiles
  ADD COLUMN role text NOT NULL DEFAULT 'customer';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('customer', 'admin', 'owner'));

CREATE INDEX idx_profiles_role
  ON public.profiles(role)
  WHERE role IN ('admin', 'owner');
```

**Why the partial index:** 99% of rows are `customer`; only index the rare admin rows for fast lookups.

**Bootstrap the owner (run once at release):**

```sql
UPDATE public.profiles
  SET role = 'owner'
  WHERE email = '<owner-email>';
```

### Step 2: Add `products.stock_quantity`

**Why:** Track inventory. When `stock_quantity = 0`, the customer frontend disables "Add to cart".

```sql
ALTER TABLE public.products
  ADD COLUMN stock_quantity integer NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD CONSTRAINT products_stock_nonnegative
  CHECK (stock_quantity >= 0);
```

**Release note:** a default of 0 would immediately show every existing product as out of stock. Run a one-off backfill during the migration to avoid this:

```sql
UPDATE public.products SET stock_quantity = 999;
```

The owner can then adjust per-product via the admin UI.

### Step 3: Add `site_content` table

**Why:** Store copy overrides in the DB so copy edits don't require redeploy. Customer frontend merges overrides onto the static i18n JSON.

```sql
CREATE TABLE public.site_content (
  key         text PRIMARY KEY,
  value_zh    text,
  value_en    text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_site_content_updated_at
  ON public.site_content(updated_at DESC);

CREATE TRIGGER site_content_set_updated_at
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

The `update_updated_at()` function should already exist from FEAT-1. If not:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Step 4: RLS Policies

**`site_content` — public read, no public write:**

```sql
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read (customer frontend needs this without a token)
CREATE POLICY "site_content_public_read"
  ON public.site_content
  FOR SELECT
  USING (true);

-- No write policy → deny all for anon/authenticated roles.
-- service_role bypasses RLS, so the backend can still write.
```

**`products.stock_quantity`:** no policy change — inherits existing `products` policies.

**`profiles.role`:** block users from escalating their own role via the Supabase client. If an existing `UPDATE` policy on `profiles` allows self-updates, tighten it so `role` cannot change from the client:

```sql
-- Drop & recreate the existing self-update policy if it exists
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;

CREATE POLICY "users_update_own_profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );
```

**Why:** prevents a logged-in customer from issuing an `UPDATE profiles SET role='owner'` via the Supabase client. The backend writes profiles through service_role, which bypasses this check.

### Step 5: Seeds (development / staging only)

```sql
INSERT INTO public.site_content (key, value_zh, value_en) VALUES
  ('home.title',    '周爸烘焙坊',         'Papa Bakery'),
  ('home.subtitle', '用心烘焙，傳遞幸福', 'Baked with love'),
  ('banner.text',   '限時優惠：滿NT$500享免運', 'Free shipping on orders over NT$500')
ON CONFLICT (key) DO NOTHING;
```

Do **not** seed in production — an empty `site_content` table means the customer frontend falls back to JSON defaults, which is the intended initial state.

### Step 6: Dashboard RPC — top-selling products

**Why:** The dashboard overview needs a top-selling products query that aggregates `order_items` by product. An RPC is cleaner and more efficient than fetching all order_items and aggregating in JS.

```sql
CREATE OR REPLACE FUNCTION get_top_selling_products(limit_count integer DEFAULT 5)
RETURNS TABLE (
  product_id integer,
  name_zh text,
  image_url text,
  total_quantity bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    oi.product_id,
    p.name_zh,
    p.image_url,
    SUM(oi.quantity)::bigint AS total_quantity
  FROM public.order_items oi
  JOIN public.products p ON p.id = oi.product_id
  GROUP BY oi.product_id, p.name_zh, p.image_url
  ORDER BY total_quantity DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Note:** `STABLE` volatility because the function only reads data. The backend calls this via `supabase.rpc('get_top_selling_products', { limit_count: 5 })`.

## Testing Steps

1. Apply the migration on a Supabase branch; confirm all three DDL blocks succeed.
2. `SELECT role FROM profiles LIMIT 1;` — column exists, defaults to `customer`.
3. `INSERT INTO site_content (key, value_zh, value_en) VALUES ('test', 'a', 'b');` → `UPDATE site_content SET value_zh='c' WHERE key='test';` → verify `updated_at` advanced.
4. Manually flip one profile to `role='owner'`. Grab that user's JWT from Supabase Auth for the backend guard tests (implemented in `backend-api.md`).
5. RLS smoke test: using the Supabase anon key for an authenticated user, attempt `UPDATE profiles SET role='owner' WHERE id=auth.uid()` — it must fail.
6. `SELECT * FROM get_top_selling_products(5);` — returns top products by quantity (may return empty if no orders exist yet; that's expected).

## Dependencies

- **Blocks:** `backend-api.md` (depends on `profiles.role`, `products.stock_quantity`, `site_content`)
- **Blocks:** `shared-types.md` (type updates mirror schema)
- **Depends on:** nothing — this is the foundation

## Notes

- Apply the migration via the Supabase MCP (`apply_migration`) or the Supabase Dashboard SQL editor. Project ID is `wqgaujuapacxuhvfatii` (from memory; verify with `list_projects` before applying).
- Order of statements matters: `profiles.role` must exist before `site_content.updated_by` references `profiles`.
- For Vercel preview environments, ensure the Supabase branch targeted by previews has the migration applied (use Supabase branching).
