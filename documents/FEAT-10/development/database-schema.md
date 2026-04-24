# Implementation Plan: Database Schema

## Overview

Adds two new tables (`pickup_locations`, `pickup_settings`) and three NOT NULL columns on `orders`. Seeds two locations. Backfills existing order rows before applying the NOT NULL constraint, per the user's decision that the three new order columns should be NOT NULL from day one.

All migrations run against the Supabase project via the Supabase MCP (`mcp__plugin_supabase_supabase__apply_migration`). Supabase service role bypasses RLS; RLS is enabled on the new tables to stay consistent with the rest of the schema.

## Files to Modify

### New migration files

Each step below is a separate `apply_migration` call (one transaction per step). Order matters — do not run in parallel.

- `pickup_locations_create`
- `pickup_settings_create`
- `orders_add_pickup_columns_nullable`
- `pickup_locations_seed`
- `orders_backfill_pickup_values`
- `orders_pickup_columns_not_null`
- `pickup_settings_seed`

No TypeScript type generation step is strictly required (the backend reads via `SupabaseService` untyped), but if `supabase gen types` is in use locally, re-run it after the final migration.

## Step-by-Step Implementation

### Step 1: Create `pickup_locations`

**Migration:** `pickup_locations_create`

```sql
CREATE TABLE public.pickup_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_zh    text NOT NULL,
  label_en    text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pickup_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pickup_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pickup_locations_read_public" ON public.pickup_locations
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE INDEX pickup_locations_active_sort_idx
  ON public.pickup_locations (is_active, sort_order);
```

**Rationale:** Soft-delete via `is_active` (rather than DELETE) because `orders.pickup_location_id` has a FK to this table. Public read restricted to active rows so the cart page never shows a retired spot. Uses the existing `public.set_updated_at` trigger function per the project convention noted in `CLAUDE.md`.

### Step 2: Create `pickup_settings` (singleton)

**Migration:** `pickup_settings_create`

```sql
CREATE TABLE public.pickup_settings (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  time_slots           text[]   NOT NULL DEFAULT ARRAY['15:00','20:00'],
  window_days          int      NOT NULL DEFAULT 30 CHECK (window_days BETWEEN 1 AND 365),
  disabled_weekdays    int[]    NOT NULL DEFAULT ARRAY[]::int[],
  closure_start_date   date,
  closure_end_date     date,
  updated_by           uuid REFERENCES auth.users(id),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT closure_range_valid
    CHECK ( (closure_start_date IS NULL AND closure_end_date IS NULL)
         OR (closure_start_date IS NOT NULL AND closure_end_date IS NOT NULL
             AND closure_end_date >= closure_start_date) )
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pickup_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pickup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pickup_settings_read_public" ON public.pickup_settings
  FOR SELECT TO anon, authenticated USING (true);
```

**Rationale:**

- `CHECK (id = 1)` guarantees exactly one row — no key/value juggling, simple `WHERE id = 1` reads.
- `time_slots text[]` of `HH:mm` strings; validation (each entry matches `^([01]\d|2[0-3]):00$` and lies in 15–22) is enforced at the service layer rather than the DB, so admin edits can produce a nicer 400 message.
- `disabled_weekdays` uses JS `Date.getDay()` semantics (`0=Sun..6=Sat`) to match the frontend directly.
- Closure range stored as two nullable `date` columns with a CHECK preventing a start without an end or inverted ranges. If requirements grow to support multiple closures later, promote to a child table.

### Step 3: Add pickup columns on `orders` (nullable first)

**Migration:** `orders_add_pickup_columns_nullable`

```sql
ALTER TABLE public.orders
  ADD COLUMN pickup_method      text,
  ADD COLUMN pickup_location_id uuid REFERENCES public.pickup_locations(id),
  ADD COLUMN pickup_at          timestamptz;

CREATE INDEX orders_pickup_at_idx ON public.orders (pickup_at);
```

**Rationale:** Add as nullable so the table accepts the migration even though existing rows have no pickup info. NOT NULL comes back in Step 6 after the backfill. The index supports admin fulfillment queries like "orders due today".

### Step 4: Seed the two Hsinchu locations

**Migration:** `pickup_locations_seed`

```sql
INSERT INTO public.pickup_locations (label_zh, label_en, sort_order) VALUES
  ('新竹 - 昌益世紀鑫城', 'Hsinchu - Changyi Century Xincheng', 10),
  ('新竹 - 荷蘭村',       'Hsinchu - Holland Village',          20)
ON CONFLICT DO NOTHING;
```

**Rationale:** Sort order leaves gaps so new locations can slot between without renumbering.

### Step 5: Backfill existing orders

**Migration:** `orders_backfill_pickup_values`

```sql
UPDATE public.orders o
SET
  pickup_method      = 'in_person',
  pickup_location_id = (SELECT id FROM public.pickup_locations WHERE label_zh = '新竹 - 荷蘭村' LIMIT 1),
  pickup_at          = ((date_trunc('day', now() AT TIME ZONE 'Asia/Taipei')) + interval '15 hours')
                         AT TIME ZONE 'Asia/Taipei'
WHERE o.pickup_method IS NULL;
```

**Rationale:** The user explicitly chose to fill pre-existing orders with today's date at 15:00 Taipei, Holland Village, `in_person`. The `AT TIME ZONE` round-trip produces a correct `timestamptz` value (stored in UTC) for Taipei 15:00.

> ⚠️ **Parentheses are load-bearing.** Without the outer parens around `(date_trunc(...) + interval '15 hours')`, Postgres operator precedence applies `AT TIME ZONE` to the interval first and you do **not** land on 15:00 Taipei. Always verify with `SELECT pickup_at AT TIME ZONE 'Asia/Taipei' FROM orders LIMIT 1;` — the Taipei-local column should read `… 15:00:00`.

### Step 6: Enforce NOT NULL on the three order columns

**Migration:** `orders_pickup_columns_not_null`

```sql
ALTER TABLE public.orders
  ALTER COLUMN pickup_method      SET NOT NULL,
  ALTER COLUMN pickup_location_id SET NOT NULL,
  ALTER COLUMN pickup_at          SET NOT NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_method_chk
    CHECK (pickup_method IN ('in_person','seven_eleven_frozen'));
```

**Rationale:** Applied after backfill so it never fails. The CHECK replaces a Postgres enum type because adding enum values across migrations is awkward — plain text + CHECK is easier to evolve when a third method arrives.

### Step 7: Seed `pickup_settings` singleton

**Migration:** `pickup_settings_seed`

```sql
INSERT INTO public.pickup_settings (id, time_slots, window_days, disabled_weekdays)
VALUES (1, ARRAY['15:00','20:00'], 30, ARRAY[]::int[])
ON CONFLICT (id) DO NOTHING;
```

**Rationale:** Matches the product-default pickup slots (15:00 / 20:00) and the user's stated 30-day default window. Idempotent for re-runs.

## Testing Steps

1. **Run each migration one by one** via the Supabase MCP `apply_migration` tool. Confirm each returns success before queueing the next.
2. **Advisor check** — run `get_advisors({type:'security'})` and `get_advisors({type:'performance'})` after Step 7. Expect: no new warnings for `pickup_locations` / `pickup_settings` / new order columns. If RLS advisor warns, re-verify policies from Steps 1–2.
3. **Row sanity** —
   ```sql
   SELECT count(*) FROM pickup_locations;                          -- 2
   SELECT id, time_slots, window_days FROM pickup_settings;        -- 1 row, defaults
   SELECT count(*) FROM orders WHERE pickup_method IS NULL;        -- 0
   ```
4. **FK + CHECK round-trip** — try inserting an order with `pickup_method='fedex'` or an unknown `pickup_location_id` and confirm Postgres rejects (useful as a baseline before wiring the DTO layer).

## Dependencies

- Must complete before: `backend-api.md` (service needs the tables to exist), `customer-frontend.md` (cart page needs `/api/pickup-settings` to return sane data).
- Depends on: none — this is the first step.

## Notes

- The Supabase MCP auto-generates migration filenames; record the generated names in the PR description so Vercel deploys know the sequence.
- If the backfill in Step 5 is run in a staging project whose `orders` already has NOT NULL on the new columns (e.g. someone ran migrations out-of-order), re-sequence: temporarily drop NOT NULL, backfill, re-add.
- Supabase's default timezone is UTC; the backfill uses `AT TIME ZONE 'Asia/Taipei'` on both directions so 15:00 Taipei is stored as 07:00 UTC. Verify one row after the migration to confirm the conversion.

## RLS leakage note (was raised in review)

`pickup_settings` has `updated_by uuid` pointing at `auth.users(id)`. The public SELECT policy on the table is intentionally broad (cart page needs to read settings as `anon`), which means `updated_by` is technically readable by anyone who sends a raw `select * from pickup_settings`. Mitigation lives at the **service layer** (`PickupService.readSettings` narrows the column list to the five functional fields and never returns `updated_by` to the public endpoint). If we later expose this table via PostgREST / supabase-js direct client reads, replace the broad policy with a restricted grant or move the audit columns behind a separate admin-only view. For now, service-layer narrowing is the minimal correct fix.
