# Implementation Plan: Backend API

## Overview

Adds a new public read module (`HeroSlidesModule`) and wires admin CRUD into the existing `AdminModule` via two new files (`hero-slides-admin.controller.ts` + `hero-slides-admin.service.ts`). Reuses `SupabaseService`, `AdminAuthGuard`, and the existing signed-URL upload endpoint. New shared types are added to `@repo/shared` so both frontends import the same surface.

## Files to Modify

### Backend Changes

- `backend/src/hero-slides/hero-slides.module.ts` (NEW)
  - Wires controller + service.
  - Purpose: public listing route.
- `backend/src/hero-slides/hero-slides.controller.ts` (NEW)
  - `GET /api/hero-slides` returning published slides.
  - Purpose: customer FE consumer.
- `backend/src/hero-slides/hero-slides.service.ts` (NEW)
  - `listPublished()` — service-role Supabase query.
  - Purpose: read-only access path.
- `backend/src/admin/hero-slides-admin.controller.ts` (NEW)
  - `GET / POST / PATCH /reorder / PATCH /:id / DELETE /:id` under `AdminAuthGuard`.
  - Purpose: admin CRUD surface.
- `backend/src/admin/hero-slides-admin.service.ts` (NEW)
  - `list / create / update / delete / reorder`.
  - Purpose: admin business logic.
- `backend/src/admin/dto/upsert-hero-slide.dto.ts` (NEW)
  - `class-validator`-decorated DTO.
  - Purpose: DTO validation for create / update.
- `backend/src/admin/dto/reorder-hero-slides.dto.ts` (NEW)
  - `{ ids: string[] }` validator.
  - Purpose: reorder request shape.
- `backend/src/admin/admin.module.ts` (MODIFY)
  - Register the new controller + service.
- `backend/src/app.module.ts` (MODIFY)
  - Import `HeroSlidesModule` so the public route is mounted.

### Shared Types

- `shared/src/types/hero-slide.ts` (NEW)
  - `HeroSlide`, `Create…`, `Update…`, `Reorder…`, `HeroSlidesResponse`, `AdminHeroSlidesResponse`.
- `shared/src/index.ts` (MODIFY)
  - Re-export the new types.

## Step-by-Step Implementation

### Step 1: Shared types

**File:** `shared/src/types/hero-slide.ts`

**Changes:**

```ts
export interface HeroSlide {
  id: string;
  title_zh: string;
  title_en: string | null;
  subtitle_zh: string;
  subtitle_en: string | null;
  image_url: string; // intentionally NOT nullable, mirrors the column
  position: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateHeroSlideRequest {
  title_zh: string;
  title_en?: string | null;
  subtitle_zh: string;
  subtitle_en?: string | null;
  image_url: string;
  is_published?: boolean;
}

export type UpdateHeroSlideRequest = Partial<CreateHeroSlideRequest>;

export interface ReorderHeroSlidesRequest {
  ids: string[];
}

export interface HeroSlidesResponse {
  items: HeroSlide[];
}

export type AdminHeroSlidesResponse = HeroSlidesResponse;
```

**File:** `shared/src/index.ts`

**Changes:**
- Add `export * from './types/hero-slide';` next to the existing content-block re-export.

**Rationale:** Shared first so the backend service and both frontends compile against the same contract. Mirrors how every other entity is wired in this monorepo.

### Step 2: Public module — service

**File:** `backend/src/hero-slides/hero-slides.service.ts`

**Changes:**

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import type { HeroSlide, HeroSlidesResponse } from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class HeroSlidesService {
  constructor(private supabase: SupabaseService) {}

  async listPublished(): Promise<HeroSlidesResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from('hero_slides')
      .select('*')
      .eq('is_published', true)
      .order('position', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return { items: (data ?? []) as HeroSlide[] };
  }
}
```

**Rationale:** Line-for-line equivalent to `ContentBlocksService.listPublished()`. Same access pattern, same error mapping, same return shape.

### Step 3: Public module — controller

**File:** `backend/src/hero-slides/hero-slides.controller.ts`

**Changes:**

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HeroSlidesService } from './hero-slides.service';

@ApiTags('HeroSlides')
@Controller('api/hero-slides')
export class HeroSlidesController {
  constructor(private service: HeroSlidesService) {}

  @Get()
  list() {
    return this.service.listPublished();
  }
}
```

**Rationale:** Matches the `ContentBlocksController` shape exactly; one route, no guards, no params. Adding more verbs here would duplicate the admin endpoints — this controller is intentionally read-only.

### Step 4: Public module — module file

**File:** `backend/src/hero-slides/hero-slides.module.ts`

**Changes:**

```ts
import { Module } from '@nestjs/common';
import { HeroSlidesController } from './hero-slides.controller';
import { HeroSlidesService } from './hero-slides.service';

@Module({
  controllers: [HeroSlidesController],
  providers: [HeroSlidesService],
})
export class HeroSlidesModule {}
```

**File:** `backend/src/app.module.ts`

**Changes:**
- Add `import { HeroSlidesModule } from './hero-slides/hero-slides.module';`
- Add `HeroSlidesModule` to the `imports: [...]` array (next to `ContentBlocksModule`).

**Rationale:** `SupabaseModule` is `@Global()` per CLAUDE.md, so no `imports: []` is needed inside `HeroSlidesModule`.

### Step 5: Admin DTOs

**File:** `backend/src/admin/dto/upsert-hero-slide.dto.ts`

**Changes:**

```ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpsertHeroSlideDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title_zh!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title_en?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subtitle_zh!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle_en?: string | null;

  @ApiProperty()
  @IsString()
  @IsUrl()
  @MaxLength(2048)
  image_url!: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  is_published?: boolean;
}
```

**File:** `backend/src/admin/dto/reorder-hero-slides.dto.ts`

**Changes:**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderHeroSlidesDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];
}
```

**Rationale:** Validation diverges from `UpsertContentBlockDto` in three places: `image_url` is required + URL-validated, `subtitle_zh` is required, `subtitle_en` is shorter (500 char cap matches a one-line tagline rather than a paragraph). Keep the upsert DTO **shared between create and PATCH** (matches the content-blocks pattern); the service layer passes through only the keys present in the body for updates.

> **Review note (2026-04-28) — DTO/PATCH conflict:** the existing `UpsertContentBlockDto` (`backend/src/admin/dto/upsert-content-block.dto.ts`) marks **every field `@IsOptional()`** precisely because the same DTO is reused for `POST` (create) and `PATCH` (update); the service layer enforces required-ness on create. The DTO sketched in Step 5 above breaks that pattern by stamping `@IsNotEmpty()` on `title_zh`, `subtitle_zh`, and `image_url` while reusing the DTO on the `PATCH /:id` route. With the global `ValidationPipe` in `backend/src/main.ts`, a partial PATCH (e.g. just `{ "is_published": false }` for a publish toggle from the admin row Switch) will 400 because the required fields are missing. Two acceptable fixes: (a) split into `CreateHeroSlideDto` (required) + `UpdateHeroSlideDto` (all optional via `PartialType`) and wire each to the matching route, or (b) follow the content-blocks pattern: keep every field `@IsOptional()` on the DTO and move the required-ness checks into `HeroSlidesAdminService.create` only (Step 6 already shows those service-level guards). Pick (b) to stay consistent with the existing module.

> **Review note (2026-04-28) — `@IsUrl()` rejects local Supabase Storage during dev:** `class-validator`'s `@IsUrl()` rejects URLs without a TLD by default, but it also rejects custom schemes and most importantly will *accept* the production `https://wqgaujuapacxuhvfatii.supabase.co/...` URL — fine in production. However any developer running with a local/branch Supabase URL whose hostname has no public TLD (rare but possible during PR previews / branch DBs) would 400 on save. Mitigation: pass `@IsUrl({ require_tld: false })` so the validator only checks general URL shape, mirroring how `image_url` strings from `getPublicUrl` come through.

### Step 6: Admin service

**File:** `backend/src/admin/hero-slides-admin.service.ts`

**Changes:** Mirror `content-blocks-admin.service.ts` exactly. The differences:

- Replace `'content_blocks'` with `'hero_slides'` everywhere.
- Replace `description_zh` / `description_en` with `subtitle_zh` / `subtitle_en` in the payload-building blocks.
- In `create`, validate `dto.image_url` is non-empty (throw `BadRequestException('image_url is required')`).
- In `update`, do **not** allow `image_url` to be cleared to `null` — if provided it must remain non-empty (throw if blank string passed).

Skeleton:

```ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateHeroSlideRequest,
  HeroSlide,
  HeroSlidesResponse,
  UpdateHeroSlideRequest,
} from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { UpsertHeroSlideDto } from './dto/upsert-hero-slide.dto';

function normalizeNullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() === '' ? null : value;
}

@Injectable()
export class HeroSlidesAdminService {
  constructor(private supabase: SupabaseService) {}

  async list(): Promise<HeroSlidesResponse> { /* identical query, no is_published filter */ }
  async getById(id: string): Promise<HeroSlide> { /* identical */ }

  async create(dto: UpsertHeroSlideDto): Promise<HeroSlide> {
    if (!dto.title_zh?.trim()) throw new BadRequestException('title_zh is required');
    if (!dto.subtitle_zh?.trim()) throw new BadRequestException('subtitle_zh is required');
    if (!dto.image_url?.trim()) throw new BadRequestException('image_url is required');

    // ...read max(position), insert with next position...
  }

  async update(id: string, dto: UpsertHeroSlideDto): Promise<HeroSlide> {
    await this.getById(id);
    const payload: UpdateHeroSlideRequest = {};
    if (dto.title_zh !== undefined) payload.title_zh = dto.title_zh;
    if (dto.title_en !== undefined) payload.title_en = normalizeNullable(dto.title_en) ?? null;
    if (dto.subtitle_zh !== undefined) payload.subtitle_zh = dto.subtitle_zh;
    if (dto.subtitle_en !== undefined)
      payload.subtitle_en = normalizeNullable(dto.subtitle_en) ?? null;
    if (dto.image_url !== undefined) {
      if (!dto.image_url.trim()) throw new BadRequestException('image_url cannot be cleared');
      payload.image_url = dto.image_url;
    }
    if (dto.is_published !== undefined) payload.is_published = dto.is_published;
    // ...update + select.single()...
  }

  async delete(id: string): Promise<void> { /* identical */ }
  async reorder(ids: string[]): Promise<HeroSlidesResponse> { /* identical */ }
}
```

**Rationale:** Re-implementing instead of generalising avoids a multi-table abstraction whose only benefit is removing a few hundred lines of glue at the cost of obscuring the per-entity validation differences. Each service stays small enough to read end-to-end.

### Step 7: Admin controller

**File:** `backend/src/admin/hero-slides-admin.controller.ts`

**Changes:** Mirror `content-blocks-admin.controller.ts`. Skeleton:

```ts
import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { HeroSlidesAdminService } from './hero-slides-admin.service';
import { UpsertHeroSlideDto } from './dto/upsert-hero-slide.dto';
import { ReorderHeroSlidesDto } from './dto/reorder-hero-slides.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/hero-slides')
@UseGuards(AdminAuthGuard)
export class HeroSlidesAdminController {
  constructor(private service: HeroSlidesAdminService) {}

  @Get()                                            list()                     { return this.service.list(); }
  @Post()                                           create(@Body() dto: UpsertHeroSlideDto)          { return this.service.create(dto); }
  @Patch('reorder')                                 reorder(@Body() dto: ReorderHeroSlidesDto)       { return this.service.reorder(dto.ids); }
  @Patch(':id')                                     update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertHeroSlideDto) { return this.service.update(id, dto); }
  @Delete(':id')  @HttpCode(204) async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> { await this.service.delete(id); }
}
```

**Rationale:** Identical surface to the content-blocks admin controller. The `:id` route is registered after the `reorder` route to avoid `'reorder'` being treated as a UUID by `ParseUUIDPipe` — same ordering trick already used in `content-blocks-admin.controller.ts`.

### Step 8: Wire admin module

**File:** `backend/src/admin/admin.module.ts`

**Changes:**
- Add the imports: `HeroSlidesAdminController`, `HeroSlidesAdminService`.
- Append the controller to the `controllers: [...]` array.
- Append the service to the `providers: [...]` array.

**Rationale:** Same wiring as `ContentBlocksAdminController` / `Service` already use. `AdminAuthGuard` is per-controller, so nothing module-level changes.

### Step 9: Reuse the existing image upload endpoint

**File:** **none** (no code change)

**Changes:**
- Confirm the admin form posts to `POST /api/admin/uploads/content-image` (already implemented in `upload-admin.controller.ts`) for hero slide image uploads.

**Rationale:** Both surfaces drop into the same Storage bucket. Adding a hero-specific upload route would duplicate the signed-URL flow with no functional benefit. Mention this explicitly in the admin frontend plan to avoid an accidental new endpoint.

> **Review note (2026-04-28) — uploaded files end up under `content-blocks/` prefix:** `UploadAdminService.createContentImageUploadUrl` (`backend/src/admin/upload-admin.service.ts`) hard-codes the storage path to `content-blocks/${Date.now()}.${ext}`. Reusing the endpoint for hero slides therefore drops hero images into the same `content-blocks/` directory inside the `product-images` bucket — fine for v1 but worth noting so a future "purge unused content-block images" cleanup script doesn't accidentally delete images referenced by `hero_slides`. If the team later wants to separate them, add a `kind?: 'hero' | 'block'` field to `CreateUploadUrlDto` and branch on it; out of scope for this ticket but flag it in `Notes`.

> **Review note (2026-04-28) — client-side file size cap:** `admin-frontend/src/queries/useContentImageUpload.ts` enforces JPEG/PNG/WebP only (after HEIC conversion) and a 5 MB ceiling. A hero image at 1920×1080 jpeg is comfortably under that, but the admin form should surface the same constraint copy. The customer FE plan reuses the existing component (Option A in admin-frontend Step 4), so the cap travels for free — but mention it in the QA section so the manual smoke test confirms a > 5 MB image is rejected with a friendly error before the customer FE has to deal with a half-rendered slide.

## Testing Steps

1. **Unit — `hero-slides-admin.service.spec.ts`** — mock `SupabaseService.getClient` and verify:
   - `create` rejects with 400 when `image_url` is empty.
   - `create` writes `position = max + 1`.
   - `update` rejects with 400 when `image_url` is passed as blank string.
   - `update` allows `is_published` toggle without other fields.
   - `reorder` 404s when an id doesn't exist.

2. **Integration — `hero-slides.controller.e2e-spec.ts`** — boot the Nest test app:
   - Insert two `is_published = true` rows and one `is_published = false` row directly into a test schema.
   - `GET /api/hero-slides` returns 200 with `items.length === 2`, ordered by position.

3. **Integration — `hero-slides-admin.controller.e2e-spec.ts`**:
   - With an admin Bearer token: full CRUD round-trip + `PATCH /reorder` swaps positions.
   - With a non-admin Bearer token: every route returns 403.
   - With no Bearer: every route returns 401.

4. **Manual smoke** — `npm run dev` from the repo root → `curl http://localhost:3000/api/hero-slides` returns the seed row from the migration. `curl -X POST http://localhost:3000/api/admin/hero-slides -H "Authorization: Bearer <admin>" -d '{}'` returns 400 with the missing-field message.

## Dependencies

- **Depends on:** `database-schema.md` (table must exist).
- **Must complete before:** `customer-frontend.md` and `admin-frontend.md` (both call these endpoints).

> **Review note (2026-04-28) — `app.module.ts` ordering:** `ContentBlocksModule` is the closest sibling and lives at the bottom of the `imports: [...]` list (`backend/src/app.module.ts`). Add `HeroSlidesModule` directly after it. No other module ordering matters because `SupabaseModule` is `@Global()`. Trivially small but worth pinning so reviewers can grep for the diff easily.

> **Review note (2026-04-28) — admin module providers ordering:** `backend/src/admin/admin.module.ts` registers controllers and services in matching positions. Append `HeroSlidesAdminController` to `controllers: [...]` directly after `ContentBlocksAdminController`, and `HeroSlidesAdminService` to `providers: [...]` directly after `ContentBlocksAdminService`. Match positions for reviewer-friendliness — current admin module already does this for every other admin pair.

## Notes

- Both `HeroSlidesController` and `HeroSlidesAdminController` use the service-role Supabase client. The dual-client pattern from CLAUDE.md (`getClient()` for data, `getAuthClient()` for auth) does not apply here — neither route does any `auth.*` call.
- `class-validator` decorators are registered globally via `app.useGlobalPipes(new ValidationPipe(...))` in `backend/src/main.ts`. No per-controller pipe wiring needed.
- Swagger tags: public route uses `HeroSlides`, admin route uses `Admin` (matches the convention used by `content-blocks-admin.controller.ts`).
