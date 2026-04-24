# Implementation Plan: Backend API & Schema

## Overview

Add a `visible_on_home` boolean to the `categories` table, surface it on
the existing public `GET /api/categories`, and expose a new admin module
`feature-flags` with two endpoints that read and replace the set of
home-visible category IDs. All admin writes go through a single bulk
endpoint so the state on disk is always consistent.

## Files to Modify

### Database

- Supabase migration: add `visible_on_home BOOLEAN NOT NULL DEFAULT true`
  to `public.categories`.

### Backend — new module

- `backend/src/admin/feature-flags-admin.controller.ts` (new)
- `backend/src/admin/feature-flags-admin.service.ts` (new)
- `backend/src/admin/feature-flags-admin.service.spec.ts` (new)
- `backend/src/admin/dto/update-home-visible-categories.dto.ts` (new)
- `backend/src/admin/admin.module.ts`
  - Register the new controller + service
- `backend/src/category/category.service.ts`
  - `findAll()` should already return `*`; after the migration the
    extra column rides along automatically. No code change strictly
    required, but verify and add a row-level type assertion so the
    field is typed.

### Shared types

- `shared/src/types/product.ts`
  - `Category` gains `visible_on_home: boolean`
- `shared/src/types/feature-flags.ts` (new)
  - `FeatureFlagsResponse`
  - `UpdateHomeVisibleCategoriesRequest`
- `shared/src/index.ts`
  - Re-export `./types/feature-flags`

## Step-by-Step Implementation

### Step 1: DB migration

**Apply via Supabase MCP `apply_migration`** (name suggestion:
`feat8_categories_visible_on_home`):

```sql
ALTER TABLE public.categories
  ADD COLUMN visible_on_home BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.categories.visible_on_home
  IS 'FEAT-8: when false, category is hidden from the customer home page pill rack but remains usable for product assignment.';
```

**Rationale:** `DEFAULT true` means every existing category remains
visible after the migration — zero behavior change on the customer
site until someone actively toggles a flag off. `NOT NULL` keeps
downstream code free of nullability branches.

### Step 2: Shared types

**File:** `shared/src/types/product.ts`

```ts
export interface Category {
  id: number;
  slug: string;
  sort_order: number;
  visible_on_home: boolean; // ← NEW
  created_at: string;
}
```

**File:** `shared/src/types/feature-flags.ts` (new)

```ts
export interface FeatureFlagsResponse {
  homeVisibleCategoryIds: number[];
}

export interface UpdateHomeVisibleCategoriesRequest {
  category_ids: number[];
}
```

**File:** `shared/src/index.ts` — add `export * from './types/feature-flags';`

**Rationale:** `FeatureFlagsResponse` is an object envelope, not a
bare list, so adding a second flag later is additive (no breaking
rename). `UpdateHomeVisibleCategoriesRequest` uses `snake_case` for
`category_ids` to match the rest of the admin DTOs
(`create-product.dto.ts`, `update-product.dto.ts`).

### Step 3: Admin DTO

**File:** `backend/src/admin/dto/update-home-visible-categories.dto.ts`

```ts
import { ArrayMinSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class UpdateHomeVisibleCategoriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  category_ids!: number[];
}
```

**Rationale:** Rejecting `[]` server-side means "hide every category"
can't accidentally ship — the admin UI will also guard this, but this
is the cheap last line of defense.

### Step 4: Admin service

**File:** `backend/src/admin/feature-flags-admin.service.ts`

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class FeatureFlagsAdminService {
  constructor(private supabase: SupabaseService) {}

  async get() {
    const supabase = this.supabase.getClient();
    const { data, error } = await supabase
      .from('categories')
      .select('id')
      .eq('visible_on_home', true);
    if (error) throw new BadRequestException(error.message);
    return { homeVisibleCategoryIds: (data ?? []).map((r) => r.id as number) };
  }

  async replaceHomeVisibleCategories(categoryIds: number[]) {
    const supabase = this.supabase.getClient();

    // 1. Validate that every submitted id exists, so we never orphan a
    //    toggle against a deleted category.
    const { data: existing, error: existingErr } = await supabase.from('categories').select('id');
    if (existingErr) throw new BadRequestException(existingErr.message);
    const known = new Set((existing ?? []).map((r) => r.id as number));
    const unknown = categoryIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown category ids: ${unknown.join(', ')}`);
    }

    // 2. Single UPDATE that flips every row in one pass.
    //    Supabase doesn't have a batch UPDATE-with-CASE in the JS
    //    client, so two writes: set = true for the submitted ids,
    //    set = false for the complement. Both are small, bounded.
    const { error: onErr } = await supabase
      .from('categories')
      .update({ visible_on_home: true })
      .in('id', categoryIds);
    if (onErr) throw new BadRequestException(onErr.message);

    const { error: offErr } = await supabase
      .from('categories')
      .update({ visible_on_home: false })
      .not('id', 'in', `(${categoryIds.join(',')})`);
    if (offErr) throw new BadRequestException(offErr.message);

    return this.get();
  }
}
```

**Rationale:** Two-write approach keeps the code straightforward and
safe — the table is tiny (5-ish rows in practice) so we're not paying
a real cost for readability. If `categories` ever grows or this
endpoint becomes hot, switch to a single RPC.

### Step 5: Admin controller

**File:** `backend/src/admin/feature-flags-admin.controller.ts`

```ts
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { FeatureFlagsAdminService } from './feature-flags-admin.service';
import { UpdateHomeVisibleCategoriesDto } from './dto/update-home-visible-categories.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/feature-flags')
@UseGuards(AdminAuthGuard)
export class FeatureFlagsAdminController {
  constructor(private service: FeatureFlagsAdminService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put('home-visible-categories')
  updateHomeVisibleCategories(@Body() dto: UpdateHomeVisibleCategoriesDto) {
    return this.service.replaceHomeVisibleCategories(dto.category_ids);
  }
}
```

**Rationale:** Following the FEAT-5 admin module shape —
controller decorates class with `AdminAuthGuard`, relies on global
`ValidationPipe({ whitelist: true, transform: true })` from
`backend/src/main.ts` for DTO validation.

### Step 6: Module wiring

**File:** `backend/src/admin/admin.module.ts`

Add `FeatureFlagsAdminController` to `controllers` and
`FeatureFlagsAdminService` to `providers`. No new imports beyond the
existing `SupabaseModule` (global).

### Step 7: Public category endpoint (verification only)

**File:** `backend/src/category/category.service.ts`

Already uses `select('*')`; after the migration, `visible_on_home`
rides along. Update any explicit row type here if the file narrows
the shape — if it just returns Supabase's `data`, no code change
needed, only a re-type on the TS side via shared `Category`.

**Rationale:** Customer keeps getting the full category list; admin
product form (which also hits `/api/categories`) keeps getting the
full category list. Only the customer home pill rack filters, and it
does so client-side (see the customer-frontend plan).

## Testing Steps

1. **Unit tests** (`feature-flags-admin.service.spec.ts`):
   - `get()` reads back a mocked Supabase query and shapes the
     response correctly (empty array case, multi-id case).
   - `replaceHomeVisibleCategories([])` throws — covered by DTO but
     worth a belt-and-braces service test.
   - `replaceHomeVisibleCategories([999])` throws with "Unknown
     category ids" when `999` is absent from the table.
   - Happy path: given mocked `categories = [1,2,3,4,5]`, calling
     with `[1,3,5]` issues the expected two UPDATEs.
2. **E2E** (`test/admin-feature-flags.e2e-spec.ts`):
   - No Bearer → 401.
   - Bearer for a non-admin profile → 403 (AdminAuthGuard).
   - Admin Bearer: `GET` returns the current set; `PUT {category_ids:
[…]}`; subsequent `GET` returns the just-written set; public
     `GET /api/categories` for an unchecked id returns
     `visible_on_home: false`.
3. **Manual**: hit the admin PUT with curl, then `GET /api/categories`
   — the excluded category's `visible_on_home` should be `false`.

## Dependencies

- Must complete before: `admin-frontend.md` (the page consumes these
  endpoints) and `customer-frontend.md` (pills filter on the shared
  type field).
- Depends on: existing `SupabaseModule`, `AdminAuthGuard`, global
  `ValidationPipe` — all already in place.

## Notes

- **No Row-Level Security change**: service role bypasses RLS, and
  everything here is writing via the service role. If RLS ever gets
  tightened for the data client, add an explicit admin policy on
  `categories.visible_on_home`.
- **Rollback**: the migration is additive and defaults to `true`, so
  dropping the column (or ignoring the field) restores prior
  behavior.
