# Implementation Plan: Database Schema

## Overview

Create a new `public.content_blocks` table that stores an ordered list of homepage content blocks (title + description + optional image) managed by the admin backoffice. The naming is generic — the table hosts the migrated "周爸的故事" story (position 0), announcements, shipping/delivery info, and any future seasonal messaging under one shape.

## Files to Modify

### Database (Supabase SQL)

- New migration (run via Supabase Studio SQL editor or `supabase db push`):
  - Create `public.content_blocks` table.
  - Create indexes on `position`.
  - Create `updated_at` trigger using the existing `public.set_updated_at` function.
  - Create RLS policies: public read limited to `is_published = true`; service-role bypass.

## Step-by-Step Implementation

### Step 1: Create the `content_blocks` table

**Target DB:** Supabase Postgres (same project as the rest of the app — see `memory/project_papa_bakery.md` for project ID).

**SQL:**

```sql
create table public.content_blocks (
  id             uuid primary key default gen_random_uuid(),
  title_zh       text not null,
  title_en       text,
  description_zh text not null,
  description_en text,
  image_url      text,
  position       int  not null,
  is_published   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_content_blocks_position
  on public.content_blocks (position);

create index idx_content_blocks_published_position
  on public.content_blocks (position)
  where is_published = true;

create trigger content_blocks_set_updated_at
  before update on public.content_blocks
  for each row execute function public.set_updated_at();
```

**Rationale:**

- `uuid` PK matches other user-editable tables (profiles, orders) and avoids exposing sequential ids.
- `position int` is not unique so transient duplicates during a reorder are not a constraint violation — the reorder service writes all rows atomically.
- Both title/description zh are `not null`; `_en` columns are nullable so English is optional (customer FE falls back to zh).
- Partial index on `is_published = true` accelerates the public listing query, which is the hot path.
- Reuses the existing `public.set_updated_at` trigger function (see CLAUDE.md — the project uses `set_updated_at`, not `update_updated_at_column`).

### Step 2: Row Level Security

```sql
alter table public.content_blocks enable row level security;

create policy "content_blocks_public_read"
  on public.content_blocks
  for select
  using (is_published = true);
```

**Rationale:**

- Public (anon) clients can only read published rows. Admin reads go through the backend using the service-role key, which bypasses RLS — so drafts are only visible there.
- No insert / update / delete policies for non-service roles. All writes come through `AdminAuthGuard`-protected backend endpoints using the service-role client.

### Step 3: No section-title seed

Unlike the announcements-only design, there is **no section-title key** in `site_content`. Each block carries its own title; stacking blocks does not need an umbrella heading. This keeps `content_blocks` standalone and consistent whether the list holds announcements, shipping info, or the story block.

### Step 4: Seed the "周爸的故事" row (story migration)

The former hardcoded `<StorySection />` has been retired. Its copy is now a `content_blocks` row:

```sql
-- Shift existing rows up by one to make room at position 0
UPDATE public.content_blocks SET position = position + 1;

-- Insert the story as the first block. Paragraph break is preserved as '\n\n'
-- and rendered on the frontend via whitespace-pre-line.
INSERT INTO public.content_blocks
  (title_zh, title_en, description_zh, description_en, image_url, position, is_published)
VALUES (
  '周爸的故事',
  'Papa''s Story',
  E'在台灣中部一個安靜的小鎮，周爸用30年的烘焙經驗，打造出「周爸烘焙坊」。每一份麵包都是用心與傳統工法製作，只為了將最道地的歐洲村莊烘焙文化帶到您的餐桌。\n\n選用進口麵粉與天然酵種，每一口都能嘗到新鮮與誠意。不趕時間，只堅持品質—這就是周爸的承諾。',
  E'In a quiet town in central Taiwan, Papa built Papa Bakery with 30 years of baking experience. Every loaf is made with heart and traditional methods, bringing European village bakery culture to your table.\n\nUsing imported flour and natural starters, every bite is full of freshness and sincerity. No rushing, only quality — that''s Papa''s promise.',
  'https://wqgaujuapacxuhvfatii.supabase.co/storage/v1/object/public/product-images/story-bakery.jpg',
  0,
  true
);
```

**Why a bulk `position + 1` shift instead of `position = (select max...) + 1`**: the migration must put the story at position 0, so existing rows need to move. `content_blocks_position_check` only enforces `position >= 0`; there is **no** unique constraint on `position`, so the bulk shift is safe (no transient collision violations).

### Step 5: Delete the `story.*` rows in `site_content`

```sql
DELETE FROM public.site_content WHERE key LIKE 'story.%';
-- Returns 3 rows: story.title, story.p1, story.p2
```

This pairs with the removal of the `story` block from `shared/src/i18n/{zh,en}.json`. Because `SiteContentSyncService` only inserts _missing_ default keys (not delete-and-reinsert), removing the JSON + DB rows in the same deploy prevents the keys from coming back. The row count in `site_content` drops from 125 → 122.

## Testing Steps

1. Run the migration in a Supabase branch first (`mcp__plugin_supabase_supabase__create_branch` → `apply_migration` → inspect).
2. Verify with `select * from public.content_blocks;` that the table exists with zero rows.
3. Verify RLS with an anon-key query: only rows with `is_published = true` should return.
4. Verify the `updated_at` trigger fires: `update content_blocks set title_zh = title_zh where id = ...` and confirm `updated_at` advances.
5. Merge the branch after backend + frontend changes pass end-to-end.

## Dependencies

- Must complete before: `backend-api.md` (the service queries this table).
- Depends on: none — isolated DDL.

## Notes

- **No foreign keys** on `image_url`. Storage cleanup is intentionally not tied to row deletion, matching the existing product-images behavior.
- If we later want scheduled publishing, add `publish_at timestamptz` without a breaking change and widen the partial index's WHERE clause.
- If we later want layout variants (e.g. full-bleed hero vs 2-column), add `layout_variant text` with a CHECK constraint.
- The "周爸的故事" block has been migrated (Step 4). The customer-side `<StorySection />` component has been deleted — the generic `<HomeContentBlocks />` list renders the migrated row instead.
