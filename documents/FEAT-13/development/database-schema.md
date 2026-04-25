# Implementation Plan: Database Schema

## Overview

Adds two columns to FEAT-12's `shop_settings` singleton row. **No new tables.** No changes to `orders` or `order_items` — capacity is computed on-demand from those existing rows.

## Files to Modify

### Database (Supabase)

- `public.shop_settings` — add `inventory_mode` and `daily_total_limit`.
- No new triggers (the existing `set_shop_settings_updated_at` already covers `updated_at`).

### Documentation only — no migration files in this repo

Apply via Supabase MCP `apply_migration`, mirroring how FEAT-12 added `shop_settings`.

## Step-by-Step Implementation

### Step 0: Extend `products` with bilingual ingredients

**Apply via Supabase MCP (`apply_migration`, name `feat_13_product_ingredients`):**

```sql
ALTER TABLE public.products
  ADD COLUMN ingredients_zh text NULL,
  ADD COLUMN ingredients_en text NULL;
```

**Rationale:**

- Both columns are nullable so existing rows do not require backfill — the spec grid simply omits `成分` when both are null *or* both are blank strings.
- Free-form `text` matches `description_zh` / `description_en`. No length cap; the admin form is the practical bound.
- **No `'' → null` coercion at the service layer.** `description_zh` / `description_en` today pass through any empty strings from the form straight into Postgres (verified at `product-admin.service.ts:44, 64` — `.insert(dto)` / `.update(dto)` with no transform). The new `ingredients_*` columns follow the same pass-through behaviour for internal consistency. The customer FE renders via `pickLocalizedText`, which already treats blank/whitespace values as falsy — so whether the DB holds `NULL` or `''`, the `成分` row is correctly omitted.
- No CHECK constraint, no index — the column is read in product list / detail responses and has no query predicates.

### Step 1: Extend `shop_settings`

**Apply via Supabase MCP (`apply_migration`, name `feat_13_inventory_mode`):**

```sql
ALTER TABLE public.shop_settings
  ADD COLUMN inventory_mode      text    NOT NULL DEFAULT 'unlimited'
                                 CHECK (inventory_mode IN ('unlimited','daily_total')),
  ADD COLUMN daily_total_limit   integer NOT NULL DEFAULT 3
                                 CHECK (daily_total_limit >= 1
                                        AND daily_total_limit <= 999);
```

**Rationale:**

- `inventory_mode` is a small enum carried as `text` (matches the FEAT-10 / FEAT-12 convention of using `text` + `CHECK` rather than a Postgres ENUM type — easier to evolve and easier to map in the JS layer).
- Default `'unlimited'` preserves day-zero behaviour: nobody is rate-limited until the owner explicitly switches the dropdown.
- `daily_total_limit` keeps a value (default `3`, matching the PRD) even when `inventory_mode = 'unlimited'`, so flipping the dropdown back to `每日總量` does not lose the previously-set number. This matches the FEAT-12 pattern where shipping fee/threshold are kept across `shippingEnabled` toggles.
- CHECK ranges (`1..999`) are loose floors and a defensible ceiling. Tighter validation lives in the DTO so the admin gets a friendly 400 message.

### Step 2: Backfill — none required

The existing singleton row already exists from FEAT-12. The new columns are NOT NULL with defaults, so the row receives `('unlimited', 3)` in-place. No data migration.

### Step 3: Indexes — none required

The aggregate query `SELECT (pickup_at AT TIME ZONE 'Asia/Taipei')::date AS d, SUM(order_items.quantity) FROM orders JOIN order_items ON orders.id = order_items.order_id WHERE status != 'cancelled' AND pickup_at >= now() GROUP BY d` runs against the existing PK on `orders.id` and the existing FK on `order_items.order_id`. At Papa Bakery's scale (single-digit orders/day, 30-day window) this is a fast scan with no need for a date-extracting expression index. If volume grows past ~1k orders/day, revisit with a partial index `CREATE INDEX ON orders ((pickup_at AT TIME ZONE 'Asia/Taipei')::date) WHERE status != 'cancelled'`.

## Testing Steps

1. **Migration applies cleanly:**
   ```sql
   SELECT inventory_mode, daily_total_limit FROM public.shop_settings WHERE id = 1;
   -- → ('unlimited', 3)
   SELECT ingredients_zh, ingredients_en FROM public.products LIMIT 5;
   -- → 5 rows of (NULL, NULL)
   ```
2. **CHECK rejects bad values:**
   ```sql
   UPDATE public.shop_settings SET inventory_mode = 'per_product' WHERE id = 1;     -- fail
   UPDATE public.shop_settings SET daily_total_limit = 0  WHERE id = 1;             -- fail
   UPDATE public.shop_settings SET daily_total_limit = 1000 WHERE id = 1;           -- fail
   ```
3. **Aggregate query returns expected shape with seed data:** insert two non-cancelled orders for 2026-05-01 (quantities 1 and 2), one cancelled order for 2026-05-01 (quantity 5). Run the daily-load aggregate and confirm `d = 2026-05-01, sum = 3`.
4. **Ingredients round-trip:**
   ```sql
   UPDATE public.products SET ingredients_zh = '麵粉、糖、奶油', ingredients_en = 'Flour, sugar, butter' WHERE id = 1;
   SELECT ingredients_zh, ingredients_en FROM public.products WHERE id = 1;
   ```

## Dependencies

- Must complete before: `backend-api.md`, `customer-frontend.md`, `admin-frontend.md`.
- Depends on: FEAT-12 `shop_settings` table.

## Notes

- `daily_total_limit` ceiling of `999` is comfortably above any realistic Papa Bakery day. The DTO further clamps to `1..999`.
- If a future ticket adds per-product caps, those columns live on `products`, not here. This table stays for shop-wide knobs only.
- Cancellation-status semantics are owned by the BE filter in `InventoryService.getDailyLoad`. The schema does not encode "what counts" — it just stores the cap.
