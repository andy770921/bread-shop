# Implementation Plan: Backend API

## Overview

Add a public `ContentBlocksModule` for listing published content blocks, and an admin-side controller/service under the existing `AdminModule` for full CRUD + reorder. Extend the existing upload controller with a generic content-image endpoint that mirrors the product-image signed-upload flow.

## Files to Modify

### Backend Changes

- `backend/src/content-blocks/content-blocks.module.ts` — NEW
- `backend/src/content-blocks/content-blocks.controller.ts` — NEW
- `backend/src/content-blocks/content-blocks.service.ts` — NEW
- `backend/src/content-blocks/content-blocks.service.spec.ts` — NEW
- `backend/src/admin/content-blocks-admin.controller.ts` — NEW
- `backend/src/admin/content-blocks-admin.service.ts` — NEW
- `backend/src/admin/content-blocks-admin.service.spec.ts` — NEW
- `backend/src/admin/dto/upsert-content-block.dto.ts` — NEW
- `backend/src/admin/dto/reorder-content-blocks.dto.ts` — NEW
- `backend/src/admin/upload-admin.controller.ts` — extend with `content-image` endpoint
- `backend/src/admin/upload-admin.service.ts` — add `createContentImageUploadUrl()`
- `backend/src/admin/admin.module.ts` — register new controller + service
- `backend/src/app.module.ts` — import `ContentBlocksModule`

## Step-by-Step Implementation

### Step 1: Public module — `ContentBlocksModule`

**File:** `backend/src/content-blocks/content-blocks.module.ts`

```ts
import { Module } from '@nestjs/common';
import { ContentBlocksController } from './content-blocks.controller';
import { ContentBlocksService } from './content-blocks.service';

@Module({
  controllers: [ContentBlocksController],
  providers: [ContentBlocksService],
})
export class ContentBlocksModule {}
```

**File:** `backend/src/content-blocks/content-blocks.controller.ts`

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContentBlocksService } from './content-blocks.service';

@ApiTags('content-blocks')
@Controller('api/content-blocks')
export class ContentBlocksController {
  constructor(private readonly service: ContentBlocksService) {}

  @Get()
  list() {
    return this.service.listPublished();
  }
}
```

**File:** `backend/src/content-blocks/content-blocks.service.ts`

```ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { ContentBlock, ContentBlocksResponse } from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ContentBlocksService {
  constructor(private readonly supabase: SupabaseService) {}

  async listPublished(): Promise<ContentBlocksResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from('content_blocks')
      .select('*')
      .eq('is_published', true)
      .order('position', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return { items: (data ?? []) as ContentBlock[] };
  }
}
```

**Rationale:**

- Public endpoint mirrors the `site-content` module's minimal shape — no DTOs needed for a read-only list.
- Uses `SupabaseService.getClient()` (service-role) but still applies `is_published = true` defensively so the public API contract is clear even if RLS is later loosened.

### Step 2: Admin service — `ContentBlocksAdminService`

**File:** `backend/src/admin/content-blocks-admin.service.ts`

Implements:

- `list()` — returns all rows (drafts + published) ordered by `position`.
- `getById(id)` — returns one row, throws `NotFoundException` if missing.
- `create(dto)` — validates `title_zh` and `description_zh` are present (else `BadRequestException` naming the missing field); normalizes empty `_en` strings to `null`; computes `position = (max(position) ?? -1) + 1`, inserts, returns the created row.
- `update(id, dto)` — partial update; 404 if missing.
- `delete(id)` — delete by id; 404 if missing.
- `reorder(ids)` — validates all ids exist, then upserts rows with new `position` values matching their index in the array. Single Supabase `upsert(rows, { onConflict: 'id' })` call.

**Key method (reorder):**

```ts
async reorder(ids: string[]): Promise<ContentBlocksResponse> {
  if (!ids.length) return { items: [] };

  // Fetch existing rows to preserve other columns
  const { data: existing, error: fetchErr } = await this.supabase
    .getClient()
    .from('content_blocks')
    .select('*')
    .in('id', ids);

  if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
  if ((existing?.length ?? 0) !== ids.length) {
    throw new NotFoundException('One or more content blocks not found');
  }

  const byId = new Map(existing!.map((row) => [row.id, row]));
  const updated = ids.map((id, idx) => ({ ...byId.get(id)!, position: idx }));

  const { error: upsertErr } = await this.supabase
    .getClient()
    .from('content_blocks')
    .upsert(updated, { onConflict: 'id' });

  if (upsertErr) throw new InternalServerErrorException(upsertErr.message);
  return this.list();
}
```

**Rationale:**

- Reorder is idempotent and atomic per request. The request body carries the full list, so race conditions between two admins editing simultaneously resolve to "last write wins" on the full list — simpler than per-row patch semantics.
- `create` computes max(position) + 1 in a single query rather than a sequence, matching how other tables (orders) append.

### Step 3: Admin controller — `ContentBlocksAdminController`

**File:** `backend/src/admin/content-blocks-admin.controller.ts`

```ts
import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { ContentBlocksAdminService } from './content-blocks-admin.service';
import { UpsertContentBlockDto } from './dto/upsert-content-block.dto';
import { ReorderContentBlocksDto } from './dto/reorder-content-blocks.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/content-blocks')
@UseGuards(AdminAuthGuard)
export class ContentBlocksAdminController {
  constructor(private readonly service: ContentBlocksAdminService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: UpsertContentBlockDto) {
    return this.service.create(dto);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderContentBlocksDto) {
    return this.service.reorder(dto.ids);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertContentBlockDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(id);
  }
}
```

**Rationale:**

- **Order of route decorators matters**: `@Patch('reorder')` must be declared **before** `@Patch(':id')` or NestJS will try to parse `reorder` as a UUID and reject with 400.
- `ParseUUIDPipe` prevents string-parameter confusion and matches the UUID primary key.

### Step 4: DTOs

**File:** `backend/src/admin/dto/upsert-content-block.dto.ts`

```ts
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertContentBlockDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  title_zh?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  title_en?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000)
  description_zh?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000)
  description_en?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString()
  image_url?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  is_published?: boolean;
}
```

**File:** `backend/src/admin/dto/reorder-content-blocks.dto.ts`

```ts
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderContentBlocksDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];
}
```

**Rationale:**

- Single `UpsertContentBlockDto` covers both create and update. The service enforces the "required on create" rule — if `title_zh` or `description_zh` is missing on create, return 400 with a clear message. Keeping one DTO avoids drift between create and update shapes.
- `ArrayUnique` catches client bugs where the same id appears twice in the reorder payload.

### Step 5: Extend the upload controller

**File:** `backend/src/admin/upload-admin.controller.ts`

Add a new endpoint next to the existing `product-image`:

```ts
@Post('content-image')
createContentImageUploadUrl(@Body() dto: CreateUploadUrlDto) {
  return this.service.createContentImageUploadUrl(dto);
}
```

**File:** `backend/src/admin/upload-admin.service.ts`

Add a new method mirroring `createSignedUploadUrl` but with the `content-blocks/` path prefix:

```ts
async createContentImageUploadUrl(dto: CreateUploadUrlDto) {
  const ext = extname(dto.filename).toLowerCase();
  const path = `content-blocks/${Date.now()}${ext}`;
  const { data, error } = await this.supabase
    .getClient()
    .storage.from(this.bucket)
    .createSignedUploadUrl(path);
  if (error || !data) throw new InternalServerErrorException(error?.message);
  const { data: publicData } = this.supabase
    .getClient()
    .storage.from(this.bucket)
    .getPublicUrl(path);
  return {
    uploadUrl: data.signedUrl,
    path,
    token: data.token,
    publicUrl: publicData.publicUrl,
  };
}
```

**Rationale:**

- Reusing the existing `product-images` bucket keeps Supabase config unchanged. The `content-blocks/` path prefix separates files logically without needing a new bucket.
- The existing `CreateUploadUrlDto` already covers filename + contentType; no new DTO needed. The `productId` field is simply ignored here.

### Step 6: Wire modules

**File:** `backend/src/admin/admin.module.ts`

Add `ContentBlocksAdminController` to `controllers` and `ContentBlocksAdminService` to `providers`.

**File:** `backend/src/app.module.ts`

Add `ContentBlocksModule` to the imports array alongside the other feature modules.

## Testing Steps

### Unit tests

- `backend/src/content-blocks/content-blocks.service.spec.ts`:
  - Returns only published rows, ordered by position ascending (mock Supabase client).
- `backend/src/admin/content-blocks-admin.service.spec.ts`:
  - `create()` computes `position = max + 1`.
  - `update()` throws `NotFoundException` on missing id.
  - `delete()` throws `NotFoundException` on missing id.
  - `reorder(['a','b','c'])` upserts three rows with `position` 0, 1, 2.
  - `reorder()` throws `NotFoundException` if any id is missing from the DB.

### Manual / integration

1. Boot backend: `cd backend && npm run start:dev`.
2. `curl http://localhost:3000/api/content-blocks` → `{ items: [] }` initially.
3. POST `/api/admin/content-blocks` with Bearer admin token → row appears.
4. PATCH `.../reorder` with reversed ids → re-GET shows reversed order.
5. PATCH `.../:id` with `is_published: false` → public GET hides the row, admin GET still shows it.
6. DELETE `.../:id` → 200, subsequent GET omits it.
7. POST `/api/admin/uploads/content-image` with `{ filename: 'x.png', contentType: 'image/png' }` → returns `{ uploadUrl, publicUrl, ... }`. PUT a file to `uploadUrl` → the `publicUrl` is reachable.

## Dependencies

- Must complete before: `admin-frontend.md`, `frontend-display.md`.
- Depends on: `database-schema.md`, `shared-types.md`.

## Notes

- **Do not** call auth methods on the service-role client — follow the dual-client pattern described in CLAUDE.md (`getClient()` for data, `getAuthClient()` for auth).
- On create, if the caller forgets to send `title_zh` or `description_zh`, the service should reject with a 400 that clearly names the missing field. The DTO marks them optional (for reuse in update), so the service needs the explicit check.
- Admin state-machine rules do **not** apply here — content blocks have no lifecycle beyond the `is_published` toggle.
