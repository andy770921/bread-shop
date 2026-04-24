# Implementation Plan: Admin Frontend

## Overview

Add a new `/dashboard/content-blocks` admin page that lists all content blocks (including drafts), supports create / edit / delete / reorder / publish-toggle, and reuses the existing image uploader component. Add a nav link in the admin sidebar.

## Files to Modify

### Admin Frontend Changes

- `admin-frontend/src/queries/useContentBlocks.ts` — NEW
  - React Query hooks: `useAdminContentBlocks`, `useCreateContentBlock`, `useUpdateContentBlock`, `useDeleteContentBlock`, `useReorderContentBlocks`.
- `admin-frontend/src/queries/useContentImageUpload.ts` — NEW
  - Mirrors `useProductImageUpload.ts` but calls `/api/admin/uploads/content-image`.
- `admin-frontend/src/routes/dashboard/content-blocks/ContentBlocksPage.tsx` — NEW
  - List view with drag-to-reorder, inline publish toggle, delete confirm, "Add" button.
- `admin-frontend/src/routes/dashboard/content-blocks/ContentBlockForm.tsx` — NEW
  - Create/edit form with `react-hook-form`; embeds the image uploader.
- `admin-frontend/src/components/content-blocks/ContentBlockImageUploader.tsx` — NEW
  - Thin wrapper reusing `ImageUploader`'s visual shell, wired to the content-image upload hook.
- `admin-frontend/src/App.tsx` — register `/dashboard/content-blocks` under the admin guard.
- `admin-frontend/src/components/layout/Sidebar.tsx` — add a nav item "內容區塊" to the `items` array (same pattern as existing entries).
- `admin-frontend/src/i18n/zh.json` — add `nav.contentBlocks`, `contentBlocks.*` keys used by the page/form.

## Step-by-Step Implementation

### Step 1: Query hooks

**File:** `admin-frontend/src/queries/useContentBlocks.ts`

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminContentBlocksResponse,
  ContentBlock,
  CreateContentBlockRequest,
  ReorderContentBlocksRequest,
  UpdateContentBlockRequest,
} from '@repo/shared';
import { defaultFetchFn } from '../lib/admin-fetchers';

const KEY = ['api', 'admin', 'content-blocks'] as const;

export function useAdminContentBlocks() {
  return useQuery<AdminContentBlocksResponse>({ queryKey: KEY });
}

export function useCreateContentBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateContentBlockRequest) =>
      defaultFetchFn<ContentBlock>('/api/admin/content-blocks', {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateContentBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateContentBlockRequest }) =>
      defaultFetchFn<ContentBlock>(`/api/admin/content-blocks/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteContentBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      defaultFetchFn<void>(`/api/admin/content-blocks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReorderContentBlocks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      defaultFetchFn<AdminContentBlocksResponse>('/api/admin/content-blocks/reorder', {
        method: 'PATCH',
        body: { ids } satisfies ReorderContentBlocksRequest,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
```

**Rationale:**

- Uses `adminFetchApi` (the Bearer-header wrapper) — matches how other admin queries are wired.
- Query key uses the `['api', 'admin', 'content-blocks']` tuple so the default `queryFn` can still resolve it to the correct URL via `stringifyQueryKey` if any caller falls through to the default fetcher.

### Step 2: Image upload hook

**File:** `admin-frontend/src/queries/useContentImageUpload.ts`

Copy `useProductImageUpload.ts` and change two lines:

- The backend path from `/api/admin/uploads/product-image` to `/api/admin/uploads/content-image`.
- Drop the `productId` parameter from the body (backend ignores it).

Keep the HEIC normalization, MIME allowlist, and 5 MB limit identical.

**Rationale:** The HEIC handling is nontrivial (iPhone users upload HEIC); duplicating the wrapper is cheaper than a shared abstraction at this point. Can be consolidated later when a third upload kind appears.

### Step 3: List page

**File:** `admin-frontend/src/routes/dashboard/content-blocks/ContentBlocksPage.tsx`

Layout:

- Page header: title "內容區塊" + "新增區塊" button (opens the form in create mode).
- List of cards, one per block:
  - Drag handle on the left.
  - Thumbnail (100x60) — placeholder icon if no image.
  - Title (zh) + first 80 chars of description.
  - "未發布" badge when `!is_published`; whole card dimmed to `opacity-60`.
  - Buttons: "編輯" (opens the form in edit mode) and "刪除" (confirmation dialog then DELETE).
  - Quick toggle switch for `is_published` that fires `useUpdateContentBlock` with just `{ is_published }`.
- Drag-reorder uses `@dnd-kit/core` + `@dnd-kit/sortable`. On `onDragEnd`, compute the new id order and call `useReorderContentBlocks`. Optimistically reorder the list locally; the mutation success will refresh with canonical data.

**Empty state:** "目前沒有任何內容區塊，點選右上角「新增區塊」開始建立。"

**Loading / error states:** reuse the pattern from other dashboard pages (spinner on loading; toast on error via `useToast`).

**Rationale:**

- `@dnd-kit` is the de-facto React drag library and already compatible with the existing shadcn stack. If not installed: `npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` in `admin-frontend/`.
- Optimistic reorder keeps the UX snappy; the backend response rewrites all positions canonically so any drift is corrected on success.

### Step 4: Form component

**File:** `admin-frontend/src/routes/dashboard/content-blocks/ContentBlockForm.tsx`

- Built with `react-hook-form` + `zod` resolver (same as the existing product form).
- Fields: `title_zh` (Input), `title_en` (Input), `description_zh` (Textarea, rows=6), `description_en` (Textarea, rows=6), image uploader, `is_published` (Switch).
- Two-column grid on desktop for zh / en pairs; stacked on mobile (mirroring the content editor's zh/en layout in `ContentEditor.tsx`).
- Validation: `title_zh` and `description_zh` required; `title_en` optional but max 200 chars; `description_en` optional but max 5000 chars.
- On submit:
  - Create mode → calls `useCreateContentBlock().mutateAsync()`, shows toast, closes form, resets.
  - Edit mode → calls `useUpdateContentBlock().mutateAsync()`, shows toast, closes form.
- Image field uses the new `ContentBlockImageUploader`:
  - On file select: run the upload hook; store `publicUrl` in form state as `image_url`.
  - "移除圖片" button clears `image_url` (the form then submits `image_url: null`).

**Rationale:**

- CLAUDE.md explicitly warns that `Input` and `Textarea` must remain `React.forwardRef` in this repo so `react-hook-form`'s `register` attaches refs — verify the existing shadcn components are unchanged; if not, keep them that way.
- Mirroring the content editor's zh/en two-column grid gives staff a consistent mental model across admin pages.

### Step 5: Image uploader wrapper

**File:** `admin-frontend/src/components/content-blocks/ContentBlockImageUploader.tsx`

Mirrors `components/products/ImageUploader.tsx`:

- Accepts `value: string | null`, `onChange(url: string | null)`.
- Renders drag-and-drop area with preview if `value`.
- Calls `useContentImageUpload().mutateAsync(file)` on drop / file-pick; on success calls `onChange(publicUrl)`.
- "移除圖片" button calls `onChange(null)`.
- Toast on error.

**Rationale:** A thin wrapper (rather than parametrizing `ImageUploader`) keeps the product upload code stable and makes future divergence (e.g. content blocks later support SVGs) safe.

### Step 6: Route registration + sidebar

Register the new route inside the admin guard:

```tsx
<Route path="/dashboard/content-blocks" element={<ContentBlocksPage />} />
```

In the dashboard sidebar / top nav component, add a link under the "內容管理" group (same group as "內容文案" and "功能旗標" pages):

```tsx
<NavLink to="/dashboard/content-blocks">內容區塊</NavLink>
```

## Testing Steps

1. `cd admin-frontend && npm run dev` — open http://localhost:3002, log in as admin.
2. Navigate to "內容區塊" — empty state renders.
3. Click "新增區塊", fill zh title/description, upload image, save → row appears.
4. Add a second and third block; drag the third to the top → order updates on the page.
5. Refresh → order persists.
6. Toggle publish on one → badge appears; hit the customer homepage and verify that block is hidden.
7. Edit a block: change zh description, replace image → save and verify.
8. Delete a block → confirmation prompt → row disappears; refresh → still gone.
9. Vitest: add specs for `ContentBlocksPage` (reorder fires with correct ids) and `ContentBlockForm` (zod validation rejects missing `title_zh`).

## Dependencies

- Must complete before: manual E2E.
- Depends on: `backend-api.md`, `shared-types.md`.

## Notes

- Admin is zh-only per CLAUDE.md. Field **labels** are zh; the two **value** fields inside the form (one per locale) are just the zh and en text that end up on the customer homepage.
- The customer frontend `useSiteContent()` cache does **not** need to be invalidated — content blocks are a separate query.
- Avoid adding a route-level loader; follow the existing pattern of using React Query hooks inside the component (see `ContentEditor.tsx`).
