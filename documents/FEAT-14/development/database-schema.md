# Implementation Plan: Database Schema

## Overview

Adds a single new table `hero_slides` to Supabase to drive the homepage hero carousel. Mirrors the structure of `content_blocks` but with `image_url NOT NULL`, a `subtitle_*` pair instead of `description_*`, and a seed row reproducing today's hard-coded hero so existing deployments are visually unchanged on rollout.

## Files to Modify

### Database Migrations

- **New migration file** (place in the project's normal Supabase migration directory; follow the timestamp-prefix naming used by adjacent migrations).
  - Creates table `public.hero_slides`.
  - Creates index `hero_slides_published_position_idx`.
  - Attaches the existing `public.set_updated_at` trigger.
  - Inserts the seed row.

> **Review note (2026-04-28):** there is **no `supabase/migrations/` directory in this repo** — `documents/FEAT-13/development/database-schema.md` explicitly says *"No new migration files in this repo. Apply via Supabase MCP `apply_migration`, mirroring how FEAT-12 added `shop_settings`."* The Step 1–5 SQL below is correct, but the actual rollout vehicle must be `mcp__plugin_supabase_supabase__apply_migration` (one call per logical step or one combined call named e.g. `feat_14_hero_slides`). Rewrite the file path in Step 1 from `supabase/migrations/<TIMESTAMP>_hero_slides.sql` to "applied via Supabase MCP `apply_migration` (no checked-in SQL file)". Otherwise an implementer will create a stray `supabase/migrations/` tree that the deploy pipeline ignores.

### Shared Types (covered separately by `backend-api.md`)

- `shared/src/types/hero-slide.ts` — TS surface mirroring the table.

## Step-by-Step Implementation

### Step 1: Create the table

**File:** new migration (e.g. `supabase/migrations/<TIMESTAMP>_hero_slides.sql`)

**Changes:**

```sql
CREATE TABLE public.hero_slides (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title_zh      text        NOT NULL,
  title_en      text        NULL,
  subtitle_zh   text        NOT NULL,
  subtitle_en   text        NULL,
  image_url     text        NOT NULL,
  position      integer     NOT NULL DEFAULT 0,
  is_published  boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

**Rationale:**
- `image_url NOT NULL` is the deliberate divergence from `content_blocks.image_url` — a hero slide without a background image is a 400 px white rectangle and never makes sense. Enforcing at the column means a misconfigured admin form never lands a half-broken row.
- `subtitle_zh NOT NULL` because the carousel always renders both lines visually; `subtitle_en NULL` because the EN locale is optional (FE falls back to ZH).
- `position` defaults to 0 but is overwritten on insert by the admin service (next `max(position) + 1`), matching `content_blocks` behaviour.

### Step 2: Index for the public read path

**File:** same migration

**Changes:**

```sql
CREATE INDEX hero_slides_published_position_idx
  ON public.hero_slides (is_published, position);
```

**Rationale:** Public `GET /api/hero-slides` filters `is_published = true` and orders by `position ASC`. The compound index makes that scan covering for tables of any size; cardinality is low so cost is trivial.

### Step 3: Wire `updated_at` trigger

**File:** same migration

**Changes:**

```sql
CREATE TRIGGER hero_slides_set_updated_at
  BEFORE UPDATE ON public.hero_slides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
```

**Rationale:** CLAUDE.md explicitly calls out that this project uses `public.set_updated_at` (not the legacy `update_updated_at_column`). Other tables in the schema (`content_blocks`, `products`, etc.) already use the same trigger function — reuse, don't duplicate.

### Step 4: Enable RLS (no policies)

**File:** same migration

**Changes:**

```sql
ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;
```

**Rationale:** Service role bypasses RLS. The backend uses the service-role client for both public reads (`/api/hero-slides`) and admin writes; no anon-key access path exists. This matches `content_blocks`. No policies are added because no client connects with the anon key.

### Step 5: Seed row mirroring today's hero

**File:** same migration

**Changes:**

```sql
INSERT INTO public.hero_slides
  (title_zh,        title_en,       subtitle_zh,           subtitle_en,                                image_url, position, is_published)
VALUES (
  '周爸烘焙坊',
  'Papa Bakery',
  '用心烘焙，傳遞幸福',
  'Baked with heart, shared with love',
  'https://wqgaujuapacxuhvfatii.supabase.co/storage/v1/object/public/product-images/hero-bakery.jpg',
  0,
  true
);
```

**Rationale:** Customers reaching the site on the day of deploy must not see a broken / empty hero. Seeding one row that exactly reproduces the current i18n + hard-coded image means the visual diff on rollout is **only** the height change (600 → 400 px). Source of the values:
- `title_zh` / `title_en` — `shared/src/i18n/{zh,en}.json` `home.title`.
- `subtitle_zh` / `subtitle_en` — same files, `home.subtitle`.
- `image_url` — the `STORAGE_URL + 'hero-bakery.jpg'` from `frontend/src/app/page.tsx` line 23.

### Step 6: Confirm migration runs cleanly

**File:** none (verification step)

**Changes:**

- Run the migration locally (`supabase db reset` or equivalent).
- Confirm `SELECT * FROM public.hero_slides;` returns exactly one row matching the seed values.
- Confirm `\d public.hero_slides` shows the column types, NOT NULL constraints, and the trigger.

**Rationale:** Catches typos and missing functions before the change reaches a shared environment. The seed row is the smoke test.

> **Review note (2026-04-28):** there is no local Supabase / `supabase db reset` workflow in this repo. The verification path is `mcp__plugin_supabase_supabase__execute_sql` against the linked project (`SELECT * FROM public.hero_slides;`). Replace the `supabase db reset` step with an MCP `execute_sql` smoke test, matching how FEAT-13 verified its `shop_settings` migration.

> **Review note (2026-04-28) — production rollout ordering:** the seed `INSERT` lands a row before the FE patch (which renders the new `<HeroCarousel>`) is deployed. Between migration apply and FE deploy, the **legacy** customer FE is still live. The legacy `page.tsx` does not query `/api/hero-slides`, so the seed row is harmless. But also: the **public `GET /api/hero-slides` endpoint does not exist yet** until the BE deploy lands. If the BE deploy ships *before* the migration runs, the endpoint queries a missing table and 500s — there is no mention of this in the plan. Recommended ordering: (1) migration via Supabase MCP, (2) BE deploy, (3) FE deploy. Document this strict order alongside the i18n-cleanup phasing in `i18n-cleanup.md`.

> **Review note (2026-04-28) — rollback gap:** the plan does not describe rollback. If the migration succeeds but the BE/FE deploy is reverted, the seed row + table remain in place (harmless). If the migration must be reverted (e.g. naming clash, accidental column types), there is no down-migration. State an explicit rollback note: `DROP TABLE public.hero_slides CASCADE;` is safe at any point because no other table FK-references it.

## Testing Steps

1. **Local migration apply** — run the migration; confirm no errors.
2. **Seed row visible** — `SELECT title_zh, image_url FROM public.hero_slides;` returns the expected single row.
3. **Trigger fires** — `UPDATE public.hero_slides SET title_zh = title_zh WHERE id = '<id>';` then re-`SELECT updated_at` shows a fresh timestamp.
4. **NOT NULL enforcement** — `INSERT INTO public.hero_slides (title_zh, subtitle_zh, image_url) VALUES ('a', 'b', NULL);` fails with a constraint error.
5. **RLS ON** — `\d+ public.hero_slides` reports `Row security: enabled`.

## Dependencies

- **Depends on:** existing `public.set_updated_at` function (already in place per CLAUDE.md).
- **Must complete before:** `backend-api.md` (the service can't query a table that doesn't exist) and `customer-frontend.md` / `admin-frontend.md` (which fetch from the API).

## Notes

- Production deploy: run the migration ahead of FE / BE rollouts so the very first request after the new code is live finds the seed row already there.
- If a previous environment somehow already has a `hero_slides` table (it shouldn't — this is a brand-new feature), run `DROP TABLE public.hero_slides CASCADE;` first or wrap the migration in `CREATE TABLE IF NOT EXISTS`. Default to *not* using `IF NOT EXISTS` so a name collision surfaces loudly.
- The seed insert uses literal column values, not a `SELECT FROM site_content`. The `home.title` / `home.subtitle` keys are not stored in `site_content` by default; they live in the JSON files. Hard-coding the values in the migration is correct.
