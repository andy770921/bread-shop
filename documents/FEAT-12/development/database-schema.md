# Implementation Plan: Database Schema

## Overview

Adds a single new `shop_settings` table — singleton row, `id = 1`, four typed columns. Mirrors the FEAT-10 `pickup_settings` pattern so service code can use the same `WHERE id = 1` reads/updates.

No changes to existing tables. `orders.shipping_fee` continues to hold the historical value charged at order time and is **not** recomputed by this feature.

## Files to Modify

### Database (Supabase)

- **New table:** `public.shop_settings`
- **New trigger:** `set_updated_at` on `shop_settings` (reuses the existing project-wide `public.set_updated_at()` trigger function)
- **New seed:** one row (`id = 1`) with the current production behaviour as defaults

### Documentation only — no migration files in this repo

The project applies schema changes through Supabase MCP, mirroring how FEAT-10 added `pickup_settings`. The SQL below is meant to be applied via the MCP's `apply_migration` tool, not committed as a `.sql` file.

## Step-by-Step Implementation

### Step 1: Create `shop_settings` table

**Apply via Supabase MCP (`apply_migration`, name: `feat_12_shop_settings`):**

```sql
CREATE TABLE public.shop_settings (
  id                        smallint   PRIMARY KEY DEFAULT 1
                                     CHECK (id = 1),
  shipping_enabled          boolean    NOT NULL DEFAULT true,
  shipping_fee              integer    NOT NULL DEFAULT 60
                                     CHECK (shipping_fee >= 0 AND shipping_fee <= 9999),
  free_shipping_threshold   integer    NOT NULL DEFAULT 500
                                     CHECK (free_shipping_threshold >= 0
                                            AND free_shipping_threshold <= 999999),
  promo_banner_enabled      boolean    NOT NULL DEFAULT true,
  updated_by                uuid       REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_shop_settings_updated_at
BEFORE UPDATE ON public.shop_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.shop_settings (id) VALUES (1);

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
```

**Rationale:**

- **`CHECK (id = 1)`** guarantees exactly one row, identical to `pickup_settings` from FEAT-10.
- **Defaults match today's hard-coded constants** (`SHIPPING_FEE = 60`, `FREE_SHIPPING_THRESHOLD = 500`, both flags on) so the day-zero behaviour after deploy is byte-equivalent to today's, before any admin touches the page.
- **CHECK ranges on numeric columns** are loose floors (≥ 0) and a reasonable ceiling (`9999` for fee, `999999` for threshold). Tighter range validation is owned by the DTO so the admin UI gets a friendly message; the DB CHECK is defence in depth against direct SQL writes.
- **`updated_by` SET NULL on auth.users delete** — same convention as `pickup_settings.updated_by` and `site_content.updated_by`. Keeps the row alive if the admin who last edited it is later removed.
- **RLS enabled but no policy declared** — the service role key bypasses RLS, and there is no anon read path to this table (the public endpoint goes through a controller, not direct PostgREST). Matches the `pickup_settings` decision in FEAT-10.

### Step 2: Backfill — none required

Because the seed row's defaults match the prior hard-coded constants, no backfill against `orders` or `cart_items` is needed. Existing carts will have `shipping_fee = 60` recomputed from the new DB row, which equals what the constant would have produced.

### Step 3: Index — none required

The table has exactly one row and is read with `WHERE id = 1`. No index beyond the primary key.

## Testing Steps

1. **Migration applies cleanly:**
   ```sql
   SELECT id, shipping_enabled, shipping_fee, free_shipping_threshold, promo_banner_enabled
   FROM public.shop_settings;
   -- → 1 row: (1, true, 60, 500, true)
   ```
2. **CHECK constraints reject bad values:**
   ```sql
   UPDATE public.shop_settings SET shipping_fee = -1 WHERE id = 1; -- should fail
   UPDATE public.shop_settings SET shipping_fee = 100000 WHERE id = 1; -- should fail (> 9999)
   ```
3. **Singleton CHECK works:**
   ```sql
   INSERT INTO public.shop_settings (id) VALUES (2); -- should fail (CHECK id = 1)
   ```
4. **`updated_at` auto-bumps on UPDATE** — flip `promo_banner_enabled` and re-select; confirm `updated_at` advanced.

## Dependencies

- Must complete before: `backend-api.md`, `customer-frontend.md`, `admin-frontend.md`.
- Depends on: nothing (the table is independent of all existing schema).

## Notes

- The **`MAX_ITEM_QUANTITY = 99`** constant in `shared/src/constants/cart.ts` stays where it is — it is a UI-input clamp, not a business rule the owner adjusts. Only the two shipping-related constants are removed.
- If a future ticket needs scheduling (e.g. "free shipping every weekend"), promote `shop_settings` into a child table `shipping_rules` keyed by date range. Out of scope for FEAT-12.
- The table name `shop_settings` is intentionally generic — future shop-wide knobs (default product sort order, store-closed banner) can land as new columns without another table.
