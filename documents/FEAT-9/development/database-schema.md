# Implementation Plan: Database Schema

## Overview

Create a new `public.content_blocks` table that stores an ordered list of homepage content blocks (title + description + optional image) managed by the admin backoffice. The naming is generic — the same table will host announcements, shipping/delivery info, seasonal messaging, and optionally the existing story block in the future.

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

### Step 3: No seed data

Unlike the announcements-only design, there is **no section-title key** in `site_content`. Each block carries its own title; stacking blocks does not need an umbrella heading. This keeps `content_blocks` standalone and consistent whether the list holds announcements, shipping info, or a future migrated story block.

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
- If the "周爸的故事" block is migrated later, insert it as a single row with `position = 0`. The customer-side story component would be replaced by the generic `<HomeContentBlocks />` list.
