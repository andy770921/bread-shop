# PRD: FEAT-9 Homepage Content Blocks

- **Ticket:** FEAT-9
- **Status:** Planning
- **Created:** 2026-04-24
- **Owner:** Papa Bakery

## Problem Statement

The customer homepage ends with a single hardcoded "周爸的故事" story block (title + description + image, rendered by `frontend/src/components/home/story-section.tsx`). Shop owners have no way to add additional content of the same shape — new product launches, seasonal announcements, shipping policy explanations, store updates — without a code change and redeploy.

Over time the bakery expects to stack multiple such blocks on the homepage: the existing story, one or more announcements, a shipping/delivery explanation, and so on. Staff need to manage these from the admin backoffice.

## Solution Overview

Introduce a general **Content Blocks** module. A content block is a reusable `(title, description, image)` unit that the customer homepage stacks vertically. Initial uses: announcements, shipping & delivery, seasonal messaging. The existing hardcoded story block can be migrated into this system later without schema change.

- A new `content_blocks` Postgres table storing an ordered list of `(title_zh, title_en, description_zh, description_en, image_url, position, is_published)` rows.
- Public `GET /api/content-blocks` endpoint returning published rows ordered by `position`.
- Admin CRUD + reorder endpoints under `/api/admin/content-blocks`, guarded by `AdminAuthGuard`.
- A new admin page under `/dashboard/content-blocks` with list, drag-to-reorder, create/edit form, and image uploader (reusing the existing Supabase signed-upload flow).
- A new customer-side `<HomeContentBlocks />` component rendered directly below `<StorySection />` on the homepage. Each block reuses the story section's responsive 2-column layout. The image side alternates left/right by index for visual rhythm. The component renders nothing when no block is published.

The generic name is deliberate — the same table will accommodate "最新消息", "運送方式", "門市資訊", or anything else of the same shape without reopening the schema.

Content blocks live in a **dedicated table**, not in `site_content`, because:

1. `site_content` is intentionally flat `key / value_zh / value_en` strings and its `merge-overrides.ts` flow does not support arrays.
2. Content blocks need row-level ordering and a publish flag, which are awkward as flattened keys.
3. A dedicated table keeps the admin UI (list + drag-reorder) simple and leaves room to add fields later (link URL, CTA text, layout variant) without migrating strings around.

## Goals / Success Criteria

- Owner can add a new content block (title + description + optional image) from the admin backoffice without code changes.
- Owner can reorder blocks via drag-and-drop (or up/down buttons) and the order is reflected on the homepage within one refresh.
- Owner can toggle `is_published` — unpublished items do not appear on the customer homepage but remain editable in admin.
- Customer homepage renders published blocks in zh or en matching the current locale, visually consistent with the existing story section.
- If no block is published, the homepage looks exactly as it does today (no empty heading, no empty section).

## Non-Goals

- Scheduling (publish-at / unpublish-at timestamps). `is_published` is a simple boolean toggle.
- Rich-text / Markdown in descriptions. Description is plain text; line breaks are preserved but no formatting.
- Per-block CTA buttons or link URLs. Can be added later in a follow-up ticket.
- Migrating the existing "周爸的故事" block into `content_blocks` in this ticket — it remains hardcoded. The schema is designed to accept it later.
- Multi-image carousel per block. One image per block only.
- Admin i18n. Admin remains zh-only; the two languages are only for the customer-facing content values.
- Per-block category / kind field. All blocks share one shape; if we later need variants we add a `layout_variant` enum.

## User Stories

### US-1 — Create content block

As an **owner**, I want to add a new content block with a title, description, and optional image, so that I can post news, shipping info, or any future messaging below the story section without a developer.

**Acceptance criteria:**

- Form fields: `title_zh` (required), `title_en` (optional), `description_zh` (required, multiline), `description_en` (optional, multiline), `image` (optional upload), `is_published` (checkbox, default **true**).
- On save, the block is appended to the end of the list (`position = max(position) + 1`).
- Image upload reuses the existing signed-upload flow: client requests a signed URL from the backend, PUTs the file directly to Supabase Storage, stores the returned public URL in `image_url`.
- Image constraints identical to product upload: JPEG/PNG/WebP (HEIC auto-converted), ≤ 5 MB.

### US-2 — Edit and delete

As an **owner**, I want to edit or delete any content block, so that I can correct typos or retire old content.

**Acceptance criteria:**

- Edit form is pre-populated with current values.
- Changing/replacing the image uploads a new file and updates `image_url`; the previous image is not deleted from Storage (matches product behavior).
- Delete prompts for confirmation and removes the row. Remaining items keep their relative order.

### US-3 — Reorder

As an **owner**, I want to reorder content blocks, so that the most important content appears first.

**Acceptance criteria:**

- Admin list shows items in ascending `position` order.
- Drag-to-reorder (or up/down buttons as a fallback) — on drop, the full ordered id list is PATCHed to the backend, which rewrites `position` for affected rows.
- Customer homepage order matches admin order after refresh.

### US-4 — Draft / unpublish

As an **owner**, I want to save a block without showing it on the site, so that I can prepare content in advance.

**Acceptance criteria:**

- Each row has a `is_published` toggle in both the list and the edit form.
- Unpublished rows are visually dimmed in the admin list (e.g. muted color + "未發布" badge).
- `GET /api/content-blocks` (public) returns only `is_published = true` rows. `GET /api/admin/content-blocks` returns all.

### US-5 — View content blocks on homepage

As a **customer**, I want to see additional content below the Papa's story section, so that I am informed of announcements, shipping details, or store news when I visit the site.

**Acceptance criteria:**

- Each block renders in the same 2-column layout as the story section (image on one side, text on the other; stacked on mobile).
- The image side alternates: block 0 → image right (same as the existing story section), block 1 → image left, block 2 → image right, …
- Locale switching (zh ↔ en) updates title and description. If the `_en` field is empty, the zh value is shown as fallback.
- If a block has no `image_url`, the layout collapses to a single-column centered text block (no broken image placeholder).
- If no published block exists, the whole section (including any heading) is not rendered.

## Implementation Decisions

### Modules

- **`ContentBlocksModule` (backend, public)** — `backend/src/content-blocks/`
  - `ContentBlocksController` — `GET /api/content-blocks`
  - `ContentBlocksService` — queries `content_blocks` with `is_published = true ORDER BY position ASC`
- **`ContentBlocksAdminController` / `ContentBlocksAdminService`** — `backend/src/admin/`
  - Full CRUD + reorder, guarded by `AdminAuthGuard`
  - Image upload: extend `UploadAdminController` with a generic endpoint rather than duplicating the signed-upload logic
- **`content_blocks` Postgres table** — see `development/database-schema.md`
- **Customer `<HomeContentBlocks />`** — `frontend/src/components/home/home-content-blocks.tsx`, rendered in `frontend/src/app/page.tsx` directly after `<StorySection />`
- **Admin `/dashboard/content-blocks` route** — list + create + edit pages under `admin-frontend/src/routes/dashboard/content-blocks/`

### Architecture

- Single dedicated table. The naming (`content_blocks`) is deliberately generic so the same table can host the story, announcements, shipping info, etc. in the future without a rename.
- Image upload flow is **identical** to products: backend mints a signed upload URL, client PUTs directly to Supabase Storage. The upload endpoint is generalized to `POST /api/admin/uploads/content-image` (path prefix `content-blocks/`) — see `development/backend-api.md`.
- Reorder is a single endpoint taking the full ordered list of ids — simple and idempotent. The service wraps all position updates in a single Supabase `upsert` call.
- Customer-side data is fetched with TanStack Query using the existing default `queryFn` + `stringifyQueryKey` convention: `useQuery({ queryKey: ['api', 'content-blocks'] })` resolves to `GET /api/content-blocks`. `staleTime: 60s` (the shared default) is fine.
- Alternating image side is computed at render time from the array index — no DB column needed.

### APIs / Interfaces

| Method | Path                                      | Auth      | Purpose                              |
| ------ | ----------------------------------------- | --------- | ------------------------------------ |
| GET    | `/api/content-blocks`                     | public    | List published blocks                |
| GET    | `/api/admin/content-blocks`               | AdminAuth | List all (includes drafts) for admin |
| POST   | `/api/admin/content-blocks`               | AdminAuth | Create block                         |
| PATCH  | `/api/admin/content-blocks/:id`           | AdminAuth | Update fields (partial)              |
| DELETE | `/api/admin/content-blocks/:id`           | AdminAuth | Delete row                           |
| PATCH  | `/api/admin/content-blocks/reorder`       | AdminAuth | Body `{ ids: string[] }`, rewrites positions |
| POST   | `/api/admin/uploads/content-image`        | AdminAuth | Mint signed upload URL for block image |

**Shared types** (`shared/src/types/content-block.ts`):

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
```

## Testing Strategy

- **Backend unit tests** (Jest) in `backend/src/content-blocks/` and `backend/src/admin/`:
  - Public service filters to `is_published = true` and sorts by `position`.
  - Admin service CRUD happy paths + 404 for missing id.
  - Reorder: given 3 ids in a new order, verify all three rows get updated `position` values in one call.
- **Admin-frontend tests** (Vitest):
  - Form validation (required zh fields).
  - Reorder interaction fires the reorder mutation with the correct id order.
  - Publish toggle updates the row visually and calls PATCH.
- **Customer-frontend** (Jest):
  - `<HomeContentBlocks />` renders one block per item.
  - Section hides itself when the API returns an empty list.
  - Fallback to zh when `_en` is null under locale=en.
  - Image side alternates correctly across three mock blocks.
- **Manual E2E**: create / edit / delete / reorder / toggle-publish from the admin UI, verify the homepage reflects changes in both zh and en.

## Out of Scope

- Publish scheduling (timestamp-based).
- Rich text / Markdown.
- Multiple images per block.
- Per-block CTA links.
- Deleting old images from Storage (mirrors current product behavior).
- Migrating the existing "周爸的故事" section into this table — follow-up ticket.
- A `kind` / `category` field — all blocks share one shape.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
