# Implementation Plan: Admin Frontend

## Overview

Adds a `首頁輪播圖` tab inside the existing `/dashboard/content-blocks` page (alongside the relabelled `首頁下方區塊` tab that hosts the unchanged content-blocks experience). The new tab provides full CRUD + reorder + publish-toggle for hero slides, mirroring the bottom-blocks UX with three deltas: a `subtitle_zh` / `subtitle_en` short-text pair instead of long descriptions, a required image upload, and a different set of TanStack Query hooks. Reuses the existing signed-URL upload endpoint and the shadcn `Tabs` primitive already in the codebase.

## Files to Modify

### Frontend Changes

- `admin-frontend/src/routes/dashboard/content-blocks/ContentBlocksPage.tsx` (REFACTOR)
  - Becomes a thin `<Tabs>` shell hosting two panels.
  - Existing list / form / dialog logic moves into `BottomBlocksPanel.tsx` verbatim.
- `admin-frontend/src/routes/dashboard/content-blocks/BottomBlocksPanel.tsx` (NEW)
  - The existing content-blocks list, lifted out of `ContentBlocksPage.tsx` unchanged.
- `admin-frontend/src/routes/dashboard/content-blocks/HeroSlidesPanel.tsx` (NEW)
  - New panel mirroring `BottomBlocksPanel.tsx` with hero-slide-specific hooks + form.
- `admin-frontend/src/routes/dashboard/content-blocks/HeroSlideForm.tsx` (NEW)
  - Form mirroring `ContentBlockForm.tsx`, with subtitle inputs + required image.
- `admin-frontend/src/components/hero-slides/HeroSlideImageUploader.tsx` (NEW or REUSED)
  - Either a copy of `ContentBlockImageUploader.tsx` (renamed and re-exported) or a generic shared `<ContentImageUploader>` consumed by both panels — see Step 4.
- `admin-frontend/src/queries/useHeroSlides.ts` (NEW)
  - 1-for-1 mirror of `useContentBlocks.ts` for hero slides.
- `admin-frontend/src/i18n/zh.json` and `admin-frontend/src/i18n/en.json` (MODIFY)
  - New `heroSlides.*` strings + tab labels.

### Sidebar / Routing — NOT changed

- `admin-frontend/src/components/layout/Sidebar.tsx` and `admin-frontend/src/App.tsx` are intentionally untouched. The carousel manager lives under the existing `內容區塊` sidebar item; the screenshot shows the tabs are siblings inside that page, not a new sidebar entry.

## Step-by-Step Implementation

### Step 1: Add i18n keys

**File:** `admin-frontend/src/i18n/zh.json`

**Changes:** add a top-level `heroSlides` section, mirroring the existing `contentBlocks` block but with subtitle wording. Also add the two tab labels under the `contentBlocks` namespace (or a new `contentBlocksPage` namespace) so the tab triggers can be localised:

```json
"contentBlocksPage": {
  "tabHeroSlides": "首頁輪播圖",
  "tabBottomBlocks": "首頁下方區塊"
},
"heroSlides": {
  "title": "首頁輪播圖",
  "addNew": "新增輪播圖",
  "titleZh": "標題（中文）",
  "titleEn": "標題（英文）",
  "subtitleZh": "副標題（中文）",
  "subtitleEn": "副標題（英文）",
  "image": "背景圖片",
  "imageRequired": "請上傳背景圖片",
  "isPublished": "啟用",
  "draft": "草稿",
  "moveUp": "上移",
  "moveDown": "下移",
  "edit": "編輯",
  "delete": "刪除",
  "save": "儲存",
  "saving": "儲存中…",
  "cancel": "取消",
  "empty": "尚未建立任何輪播圖。",
  "created": "已新增輪播圖",
  "updated": "已更新輪播圖",
  "deleted": "已刪除輪播圖",
  "saveFailed": "儲存失敗",
  "deleteFailed": "刪除失敗",
  "reorderFailed": "排序失敗",
  "uploadFailed": "上傳圖片失敗",
  "uploading": "上傳中…",
  "dropImage": "拖曳圖片或點擊選擇",
  "removeImage": "移除圖片",
  "deleteConfirmTitle": "確定刪除？",
  "deleteConfirmDesc": "此輪播圖將永久從首頁移除，無法復原。"
}
```

**File:** `admin-frontend/src/i18n/en.json`

**Changes:** mirror in English, e.g. `tabHeroSlides: "Homepage Carousel"`, `tabBottomBlocks: "Homepage Blocks"`, etc.

**Rationale:** Keeping the strings under a fresh `heroSlides` namespace avoids overloading `contentBlocks.*` and makes future divergence (e.g. CTA fields) painless. The two tab labels live under their own namespace so they can be reused if more tabs are added later.

### Step 2: Add TanStack Query hooks

**File:** `admin-frontend/src/queries/useHeroSlides.ts`

**Changes:** copy `useContentBlocks.ts` and apply find-replace:
- `'content-blocks'` → `'hero-slides'` (in URL paths and query key)
- `ContentBlock`, `AdminContentBlocksResponse`, `CreateContentBlockRequest`, `UpdateContentBlockRequest`, `ReorderContentBlocksRequest` → the hero-slide equivalents
- Hook names: `useAdminContentBlocks` → `useAdminHeroSlides`, `useCreateContentBlock` → `useCreateHeroSlide`, etc.

The shape stays identical, including the optimistic reorder via `onMutate` / `onError`. No new behaviour.

**Rationale:** A 1-for-1 copy is faster to read, faster to review, and avoids generic abstractions whose only payoff is removing two files of glue. Per the PRD's architecture discussion, the entities are intentionally separate.

### Step 3: Lift the existing list logic into `BottomBlocksPanel.tsx`

**File:** `admin-frontend/src/routes/dashboard/content-blocks/BottomBlocksPanel.tsx`

**Changes:**

- Cut the entire current contents of `ContentBlocksPage.tsx` (the default-export function and its imports).
- Paste into the new file `BottomBlocksPanel.tsx`.
- Rename `export default function ContentBlocksPage()` to `export function BottomBlocksPanel()`.
- Remove the outer `<div className="space-y-4 md:space-y-6"> <h1>...</h1> ... </div>` wrapper's `<h1>` (the page-level title moves to the parent shell). Keep the rest verbatim.

**Rationale:** The brief promises "the existing 內容區塊 page is unchanged inside the new tab". Moving the code wholesale into a panel and only stripping the page-level chrome (h1) preserves every visible behaviour, every TanStack hook, every test selector.

> **Review note (2026-04-28) — `<h1>` and the "+ Add new" button share a row:** `ContentBlocksPage.tsx:111–120` wraps the heading and the `Plus` button inside one flex row (`<div className="flex items-center justify-between">`). "Removing the `<h1>`" leaves the `Plus` button orphaned at the top of the panel without its label row, AND it loses the "Add new" affordance because the heading flexbox sibling is gone. The lift needs to either keep the `<div className="flex items-center justify-between">` wrapper around the `Plus` button (with the heading element replaced by a spacer or moved into the parent shell) OR keep the inline heading and demote the parent `<h1>` to just `nav.contentBlocks`. Recommended: keep the row inside `BottomBlocksPanel` but replace `<h1>{t('contentBlocks.title')}</h1>` with an empty `<div>` placeholder (or `<span>`) so the button stays right-aligned. Do the same in `HeroSlidesPanel`. Failing to handle this means the button silently shifts to the left edge of the panel.

### Step 4: Decide on the image uploader

**Two acceptable approaches.** Pick one before implementation:

- **Option A (lower risk, ~5 lines of duplication).** Create `admin-frontend/src/components/hero-slides/HeroSlideImageUploader.tsx` as a copy of `ContentBlockImageUploader.tsx`. Replace the i18n key prefix `contentBlocks.*` with `heroSlides.*`. Identical signed-URL upload flow.
- **Option B (small refactor).** Extract the `ContentBlockImageUploader.tsx` body into a generic `<ContentImageUploader>` (e.g. `admin-frontend/src/components/shared/ContentImageUploader.tsx`) that accepts `labels: { dropImage, uploading, uploadFailed, removeImage }` as props. Both panels' forms then pass their localised label bag.

**Recommendation: Option A.** The user specifically asked for the existing 內容區塊 experience to be untouched; touching the shared component invites a regression in the bottom-blocks panel that the QA scope of this ticket doesn't fully cover. Re-evaluate during code review.

**Rationale:** Either approach reuses the backend `POST /api/admin/uploads/content-image` endpoint without new code; the question is purely about FE glue ergonomics.

### Step 5: Build `HeroSlideForm.tsx`

**File:** `admin-frontend/src/routes/dashboard/content-blocks/HeroSlideForm.tsx`

**Changes:** mirror `ContentBlockForm.tsx` with these deltas:

- Replace `description_zh` / `description_en` with `subtitle_zh` / `subtitle_en`. Use `<Input>` (single-line) instead of `<Textarea>`.
- Zod schema:
  ```ts
  const schema = z.object({
    title_zh: z.string().trim().min(1).max(200),
    title_en: z.string().max(200).optional().or(z.literal('')),
    subtitle_zh: z.string().trim().min(1).max(500),
    subtitle_en: z.string().max(500).optional().or(z.literal('')),
    image_url: z.string().url(),       // not nullable; required
    is_published: z.boolean(),
  });
  ```
- The `<ContentBlockImageUploader>` becomes `<HeroSlideImageUploader>` (or the shared component from Option B). Bind it via `Controller` so the `image_url` field is always a `string`, never `null`.
- The submit button stays disabled until `image_url` is non-empty — `useForm`'s `formState.isValid` plus the Zod `.url()` covers this.
- `defaultValues` use empty strings for everything except `is_published: true` and `image_url: ''`.

**Rationale:** Sticking to `<Input>` (single line) for subtitles signals to the admin that this is a short tagline, not a paragraph. Capping at 500 chars matches the BE validator. Image required at the form level prevents the user from saving a half-built slide.

### Step 6: Build `HeroSlidesPanel.tsx`

**File:** `admin-frontend/src/routes/dashboard/content-blocks/HeroSlidesPanel.tsx`

**Changes:** copy `BottomBlocksPanel.tsx` and apply:

- Hooks: `useAdminContentBlocks` → `useAdminHeroSlides`, etc.
- Form: render `<HeroSlideForm>` instead of `<ContentBlockForm>` inside the dialog.
- Row card preview: show `block.subtitle_zh` instead of the multi-line description (`<p className="line-clamp-1">{block.subtitle_zh}</p>`).
- i18n prefixes: `contentBlocks.*` → `heroSlides.*` (toast strings, button labels, dialog titles, empty state).
- The body shape (list, reorder via up/down arrows, publish switch, edit / delete buttons, delete-confirm dialog) is otherwise identical.

The submit handler:

```ts
async function handleSubmit(values: HeroSlideFormValues) {
  const body = {
    title_zh: values.title_zh,
    title_en: values.title_en?.trim() ? values.title_en.trim() : null,
    subtitle_zh: values.subtitle_zh,
    subtitle_en: values.subtitle_en?.trim() ? values.subtitle_en.trim() : null,
    image_url: values.image_url,
    is_published: values.is_published,
  };
  // ...mutate, toast, close...
}
```

**Rationale:** Empty-string-to-null coercion mirrors the bottom-blocks pattern exactly, so the BE service's `normalizeNullable` helper sees the same input shape from both surfaces.

### Step 7: Convert `ContentBlocksPage.tsx` into the tab shell

**File:** `admin-frontend/src/routes/dashboard/content-blocks/ContentBlocksPage.tsx`

**Changes:** replace the entire contents with:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLocale } from '@/hooks/use-locale';
import { HeroSlidesPanel } from './HeroSlidesPanel';
import { BottomBlocksPanel } from './BottomBlocksPanel';

export default function ContentBlocksPage() {
  const { t } = useLocale();
  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="font-serif text-lg font-bold text-text-primary md:text-2xl">
        {t('nav.contentBlocks')}
      </h1>
      <Tabs defaultValue="hero" className="space-y-4 md:space-y-6">
        <TabsList>
          <TabsTrigger value="hero">{t('contentBlocksPage.tabHeroSlides')}</TabsTrigger>
          <TabsTrigger value="bottom">{t('contentBlocksPage.tabBottomBlocks')}</TabsTrigger>
        </TabsList>
        <TabsContent value="hero">
          <HeroSlidesPanel />
        </TabsContent>
        <TabsContent value="bottom">
          <BottomBlocksPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Rationale:**
- `defaultValue="hero"` matches the screenshot, where 首頁輪播圖 is the leftmost (and active) tab.
- The page-level `<h1>` is the sidebar item label `nav.contentBlocks` — the existing string, untouched.
- `Tabs` is already in `admin-frontend/src/components/ui/tabs.tsx` and used by `ProductList.tsx`, so no new shadcn install needed.

### Step 8: Verify the App route stays the same

**File:** `admin-frontend/src/App.tsx`

**Changes:** none expected. The single line `<Route path="content-blocks" element={<ContentBlocksPage />} />` continues to work — the page is still the default export.

**Rationale:** Catches the case where someone refactored the route mapping locally; one-line confirmation only.

## Testing Steps

1. **Unit — `HeroSlideForm.spec.tsx`** (new): rendering with no initial value → submit button disabled until image is uploaded; entering a URL via mocked uploader → submit enabled; clearing the title shows the field error; submitting trims whitespace.
2. **Unit — `HeroSlidesPanel.spec.tsx`** (new): mocked `useAdminHeroSlides` returns three rows → all three render in order; clicking the up arrow on the second row calls `useReorderHeroSlides` with the swapped id list; toggling the publish switch calls `useUpdateHeroSlide` with `{ is_published: <new> }`.
3. **Unit — `ContentBlocksPage.spec.tsx`** (new or extended): default tab is hero (`getByText('首頁輪播圖')`); switching to bottom tab renders the legacy list (`getByText('首頁下方區塊')`); the `<h1>` is the unchanged `內容區塊` label.
4. **Manual** — `npm run dev` from the repo root; log into `/dashboard/content-blocks` as an admin:
   - Tabs render in the order `首頁輪播圖 ｜ 首頁下方區塊`.
   - Default tab is `首頁輪播圖`.
   - Switching to `首頁下方區塊` shows the existing list with the seeded blocks intact.
   - Add a new slide → form rejects submit until an image is uploaded; after upload, save succeeds, toast appears, list updates.
   - Toggle publish → row dims; edit → dialog pre-fills with current values; delete → confirm dialog → list shrinks.
   - Reorder via up/down arrows → optimistic UI updates instantly; refresh page → order persists.
5. **Cross-surface manual** — after changes in admin, refresh the customer storefront and visually confirm the carousel reflects the new state (publish toggle hides a slide; reorder changes the slide order; new image renders without aspect issues).
6. **Type-check** — `cd admin-frontend && npx tsc --noEmit` passes.

## Dependencies

- **Depends on:** `backend-api.md` (admin endpoints must be live), `database-schema.md` (table + seed row).
- **Must complete before:** internal QA / staging deployment.

## Notes

- **Sidebar label is unchanged.** The existing `nav.contentBlocks` ("內容區塊") still labels the sidebar entry. We are not renaming it to "首頁內容" or splitting it into two — the user's screenshot is explicit that one sidebar entry holds both tabs.
- **`Input` and `Textarea` rely on `forwardRef`** per CLAUDE.md. Both forms (`HeroSlideForm`, the existing `ContentBlockForm`) use `register('field_name')`, which depends on the ref being attachable. Don't downgrade those primitives in passing.
- **No new sidebar icon.** The `Layers` icon already used for `nav.contentBlocks` continues to apply.
- **TanStack default queryFn already handles `['api','admin','hero-slides']`.** Per the same `stringifyQueryKey` mechanism used elsewhere in admin queries — no per-hook `queryFn` needed for the GET hook; only mutations need `defaultFetchFn`.
- **Upload endpoint reuse is intentional.** Don't add `POST /api/admin/uploads/hero-image` — the existing `content-image` endpoint already drops into the `product-images` Storage bucket and returns a public URL that works for any FE consumer.
- **Empty-en fields collapse to `null` at submit time.** Mirrors the existing content-blocks flow so both surfaces end up with the same DB shape (no `''` strings in nullable columns).
- **i18n EN translations need a real translator pass.** The strings above are placeholders; the team can polish before merge.

> **Review note (2026-04-28) — admin `t()` does not interpolate either:** `admin-frontend/src/hooks/use-locale.ts:44–58` mirrors the customer FE — `t(key)` is a plain dotted-path lookup. None of the admin strings introduced here use `{n}`/`{total}` placeholders today, but if a future revision adds `"已新增 {count} 張"` style keys, they will not interpolate. Either keep all admin strings literal-only or extend `t()` symmetrically with the customer FE fix from `customer-frontend.md`'s review note.

> **Review note (2026-04-28) — `Tabs` import alias and existing usage:** the plan says `Tabs` is "already in `admin-frontend/src/components/ui/tabs.tsx` and used by `ProductList.tsx`" — verified the file exists at that path. The recommended import in Step 7 (`import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';`) matches the project's `@/*` Vite path alias. Confirmed.

> **Review note (2026-04-28) — no existing `ContentBlocksPage.spec.tsx`:** Step 3 in Testing says "extend existing, if any" for `ContentBlocksPage.spec.tsx`. There is **no existing spec file** for `ContentBlocksPage`. The test suite under `admin-frontend/src/lib/content-keys.spec.ts` covers a different concern. So Step 3 is creating a new file, not extending one — re-word the Testing section accordingly. Also: the file naming convention in `admin-frontend` is `*.spec.ts(x)` (verified by grep), matching the plan.

> **Review note (2026-04-28) — Sidebar label vs page header:** the sidebar entry label `nav.contentBlocks` (`內容區塊`) is the only header text after this refactor, since the `<h1>` inside `ContentBlocksPage` is being kept and reads from the same key. Be careful not to change `nav.contentBlocks` in this ticket: an earlier discussion in the PRD considered renaming to "首頁內容" but the current plan explicitly keeps it. Confirmed by reading `admin-frontend/src/i18n/zh.json:9` where `nav.contentBlocks = "內容區塊"`. Leave untouched.

> **Review note (2026-04-28) — defaultValue mismatch with screenshot text:** the screenshot shows `首頁輪播圖 ｜ 首頁下方區塊` with a `｜` (full-width pipe) separator visually between the two tabs. shadcn `TabsList` renders triggers side-by-side without a visual separator. The implementer should NOT add a literal `｜` glyph between triggers — it would render as part of the second tab's label. Use `TabsList` default styling and treat the screenshot's `｜` as a visual cue from the design tool, not a piece of the copy. Add this as a one-liner in Notes to prevent confusion during code review.
