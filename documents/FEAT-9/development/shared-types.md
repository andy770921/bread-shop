# Implementation Plan: Shared Types

## Overview

Add the `ContentBlock` domain types to `@repo/shared` so the backend, customer frontend, and admin frontend all import from a single source of truth — matching the pattern already used for `Product`, `Order`, `SiteContent`, etc.

## Files to Modify

### Shared Types

- `shared/src/types/content-block.ts` — NEW
  - Export `ContentBlock`, `CreateContentBlockRequest`, `UpdateContentBlockRequest`, `ReorderContentBlocksRequest`, `ContentBlocksResponse`, `AdminContentBlocksResponse`.

- `shared/src/index.ts`
  - Re-export the new types.

## Step-by-Step Implementation

### Step 1: Create `shared/src/types/content-block.ts`

**File:** `shared/src/types/content-block.ts`

**Contents:**

```ts
export interface ContentBlock {
  id: string;
  title_zh: string;
  title_en: string | null;
  description_zh: string;
  description_en: string | null;
  image_url: string | null;
  position: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateContentBlockRequest {
  title_zh: string;
  title_en?: string | null;
  description_zh: string;
  description_en?: string | null;
  image_url?: string | null;
  is_published?: boolean;
}

export type UpdateContentBlockRequest = Partial<CreateContentBlockRequest>;

export interface ReorderContentBlocksRequest {
  ids: string[];
}

export interface ContentBlocksResponse {
  items: ContentBlock[];
}

export type AdminContentBlocksResponse = ContentBlocksResponse;
```

**Rationale:**

- Split `Create` and `Update` because `title_zh` and `description_zh` are required on create but optional on update.
- `AdminContentBlocksResponse` is a type alias so the two response shapes can diverge later (e.g. admin may want to include `updated_by`) without a breaking rename.
- `image_url` nullable on the response because blocks without images are supported.

### Step 2: Re-export from the package root

**File:** `shared/src/index.ts`

**Changes:**

Add near the existing site-content export:

```ts
export * from './types/content-block';
```

**Rationale:** Existing consumers do `import { ContentBlock } from '@repo/shared'` — no subpath imports needed.

### Step 3: Rebuild the shared package

**Command:** `cd shared && npm run build`

**Rationale:** `@repo/shared` emits CommonJS and is consumed in pre-built form by the two frontends (see CLAUDE.md — Turbo chain runs `^build` before test/lint). The admin-frontend's Vite interop config already handles CJS, so no Vite change is needed.

## Testing Steps

1. From `shared/`, run `npm run build` and confirm `shared/dist/types/content-block.d.ts` exists.
2. From `backend/`, `frontend/`, `admin-frontend/`, run `npx tsc --noEmit` — no missing-type errors.
3. In any consumer, `import { ContentBlock } from '@repo/shared'` autocompletes.

## Dependencies

- Must complete before: `backend-api.md`, `admin-frontend.md`, `frontend-display.md` (they all import these types).
- Depends on: none.

## Notes

- Dates are ISO strings on the wire (matches other response types like `Product.created_at`).
- Keep field names snake_case to match Supabase column names and the rest of the shared types — do **not** camelCase here.
