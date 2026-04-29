# Implementation Plan: Admin Frontend

## Overview

Adds a `首頁輪播圖` tab inside the existing `/dashboard/content-blocks` page (alongside the relabelled `首頁下方區塊` tab that hosts the unchanged content-blocks experience). The new tab provides full CRUD + reorder + publish-toggle for hero slides, mirroring the bottom-blocks UX with three deltas: a `subtitle_zh` / `subtitle_en` **multi-line** text pair (admin uses `<Textarea>`; admin-entered line breaks render as line breaks on the storefront, with the whole text block centred), a required image upload, and a different set of TanStack Query hooks. Reuses the existing signed-URL upload endpoint and the shadcn `Tabs` primitive already in the codebase.

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
  - Form mirroring `ContentBlockForm.tsx`, with **multi-line** `<Textarea>` subtitle inputs + required image.
- `frontend/src/components/home/hero-carousel.tsx` (MODIFY)
  - Add `whitespace-pre-line` to the subtitle `<p>` so admin-entered `\n` renders as actual line breaks. Centring is already handled by the parent `text-center` flex column — no layout changes needed.
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
  "subtitleHint": "支援多行：在編輯器內按 Enter 換行，前台會以同樣的斷行方式顯示。",
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

**Changes:** mirror in English, e.g. `tabHeroSlides: "Homepage Carousel"`, `tabBottomBlocks: "Homepage Blocks"`, `subtitleHint: "Supports line breaks — press Enter to wrap; the storefront preserves the same line breaks."` etc.

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

- Replace `description_zh` / `description_en` with `subtitle_zh` / `subtitle_en`. Use `<Textarea>` (**multi-line**, `rows={3}`) — `<Input>` strips `\n` so it cannot be used here. The Enter key inside the textarea must insert a newline (default browser behaviour); do **not** intercept it for form submission.
- Render the `subtitleHint` string under both subtitle fields (small muted text) so the admin understands that line breaks are honoured by the storefront.
- Zod schema:
  ```ts
  const schema = z.object({
    title_zh: z.string().trim().min(1).max(200),
    title_en: z.string().max(200).optional().or(z.literal('')),
    // .trim() is intentionally NOT applied to subtitles — it would strip leading/trailing
    // newlines the admin may have entered on purpose. We only trim title fields.
    subtitle_zh: z.string().min(1).max(500),
    subtitle_en: z.string().max(500).optional().or(z.literal('')),
    image_url: z.string().url(),       // not nullable; required
    is_published: z.boolean(),
  });
  ```
- The `<ContentBlockImageUploader>` becomes `<HeroSlideImageUploader>` (or the shared component from Option B). Bind it via `Controller` so the `image_url` field is always a `string`, never `null`.
- The submit button stays disabled until `image_url` is non-empty — `useForm`'s `formState.isValid` plus the Zod `.url()` covers this.
- `defaultValues` use empty strings for everything except `is_published: true` and `image_url: ''`.

**Rationale:** Subtitles can be a tagline OR a 2–3-line caption (e.g. `手作，健康！\n無添加任何化學添加物！`). `<Textarea rows={3}>` matches that intent and preserves `\n` characters end-to-end (admin form → BE → DB → storefront). `.trim()` is dropped on subtitle fields specifically so admin-authored line breaks survive the round trip; the `.min(1)` still rejects pure-empty input. Capping at 500 chars matches the BE validator. Image required at the form level prevents the user from saving a half-built slide.

### Step 6: Build `HeroSlidesPanel.tsx`

**File:** `admin-frontend/src/routes/dashboard/content-blocks/HeroSlidesPanel.tsx`

**Changes:** copy `BottomBlocksPanel.tsx` and apply:

- Hooks: `useAdminContentBlocks` → `useAdminHeroSlides`, etc.
- Form: render `<HeroSlideForm>` instead of `<ContentBlockForm>` inside the dialog.
- Row card preview: show `block.subtitle_zh` instead of the multi-line description. Use `line-clamp-1` so multi-line subtitles collapse to a single line in the admin row list (admin only — the storefront keeps full multi-line rendering): `<p className="line-clamp-1">{block.subtitle_zh}</p>`.
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

### Step 8: Render admin-entered line breaks on the storefront

**File:** `frontend/src/components/home/hero-carousel.tsx`

**Changes:**

- Add `whitespace-pre-line` to the subtitle `<p>` in **both** `StaticSlide` (line 69) and `CarouselSlides` (line 127):
  ```tsx
  <p className={`max-w-lg whitespace-pre-line text-white/90 ${subtitleSize(slide)}`}>
    {pickSubtitle(slide, locale)}
  </p>
  ```
- No change to the surrounding container. The text block is already centred — `flex flex-col items-center ... text-center` on the parent (lines 65 / 123) handles vertical-axis centring of the column and horizontal text alignment for each line. With `whitespace-pre-line`, every line of the subtitle inherits `text-center` and centres independently, so a 2-line subtitle stays visually centred as a stacked block.
- Do **not** use `whitespace-pre` (it preserves *all* whitespace including the indentation of the JSX, breaking layout) or `whitespace-pre-wrap` (acceptable but strictly stronger than needed; `pre-line` collapses runs of spaces while honouring `\n`, which matches what an admin actually wants).

**Rationale:** The subtitle is stored as a plain `string` end-to-end (admin Textarea → JSON body → Postgres `text` column → React `<p>{string}</p>`). `\n` survives every hop, but by default browsers collapse it to a space when rendering text. `whitespace-pre-line` is the minimal CSS opt-in that turns those `\n`s back into visible line breaks **without** also preserving the surrounding JSX/source-level whitespace. Centring is unchanged because `text-center` applies per-line under `pre-line`.

### Step 9: Verify the App route stays the same

**File:** `admin-frontend/src/App.tsx`

**Changes:** none expected. The single line `<Route path="content-blocks" element={<ContentBlocksPage />} />` continues to work — the page is still the default export.

**Rationale:** Catches the case where someone refactored the route mapping locally; one-line confirmation only.

## Testing Steps

1. **Unit — `HeroSlideForm.spec.tsx`** (new): rendering with no initial value → submit button disabled until image is uploaded; entering a URL via mocked uploader → submit enabled; clearing the title shows the field error; submitting trims title whitespace **but preserves `\n` characters in subtitles** (i.e. inputting `"line1\nline2"` into `subtitle_zh` and submitting yields `subtitle_zh === "line1\nline2"` in the captured payload — not `"line1 line2"` and not `"line1line2"`).
2. **Unit — `HeroSlidesPanel.spec.tsx`** (new): mocked `useAdminHeroSlides` returns three rows → all three render in order; clicking the up arrow on the second row calls `useReorderHeroSlides` with the swapped id list; toggling the publish switch calls `useUpdateHeroSlide` with `{ is_published: <new> }`.
3. **Unit — `ContentBlocksPage.spec.tsx`** (new or extended): default tab is hero (`getByText('首頁輪播圖')`); switching to bottom tab renders the legacy list (`getByText('首頁下方區塊')`); the `<h1>` is the unchanged `內容區塊` label.
4. **Manual** — `npm run dev` from the repo root; log into `/dashboard/content-blocks` as an admin:
   - Tabs render in the order `首頁輪播圖 ｜ 首頁下方區塊`.
   - Default tab is `首頁輪播圖`.
   - Switching to `首頁下方區塊` shows the existing list with the seeded blocks intact.
   - Add a new slide → form rejects submit until an image is uploaded; after upload, save succeeds, toast appears, list updates.
   - Toggle publish → row dims; edit → dialog pre-fills with current values; delete → confirm dialog → list shrinks.
   - Reorder via up/down arrows → optimistic UI updates instantly; refresh page → order persists.
5. **Cross-surface manual** — after changes in admin, refresh the customer storefront and visually confirm the carousel reflects the new state (publish toggle hides a slide; reorder changes the slide order; new image renders without aspect issues). **Multi-line subtitle check:** in the admin form, enter `手作，健康！\n無添加任何化學添加物！` (with a real Enter keypress between the two lines) into `subtitle_zh`, save, then reload the storefront — the storefront subtitle must render as two visually centred lines stacked vertically. Confirm the same for `subtitle_en` when the locale is switched. Edit the same slide and verify the admin Textarea re-populates with the line break preserved (i.e. round-trip is non-lossy).
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
- **Empty-en fields collapse to `null` at submit time.** Mirrors the existing content-blocks flow so both surfaces end up with the same DB shape (no `''` strings in nullable columns). Note: a subtitle that contains only `\n` whitespace (e.g. `"\n\n"`) should still collapse to `null` for the optional `_en` variants — apply the same `values.subtitle_en?.trim() ? ... : null` coercion already used for descriptions; the `.trim()` here is on the **outgoing payload**, not on the form value the admin sees.
- **Subtitle line breaks are stored verbatim.** The DB column is plain `text`; no normalisation. The customer FE uses `whitespace-pre-line` to honour them. The admin row-list preview uses `line-clamp-1` to keep the row dense — this is intentional asymmetry between admin and storefront.
- **Tab order check.** With `<Textarea>` for subtitles, keyboard-only admins should still be able to tab through the form linearly: title_zh → title_en → subtitle_zh → subtitle_en → image upload → publish switch → save. Inside a `<Textarea>`, Tab inserts a `\t` only if explicitly handled — default behaviour is to move focus, which is what we want here. Don't add a custom `onKeyDown` that traps Tab.
- **i18n EN translations need a real translator pass.** The strings above are placeholders; the team can polish before merge.

> **Review note (2026-04-28) — admin `t()` does not interpolate either:** `admin-frontend/src/hooks/use-locale.ts:44–58` mirrors the customer FE — `t(key)` is a plain dotted-path lookup. None of the admin strings introduced here use `{n}`/`{total}` placeholders today, but if a future revision adds `"已新增 {count} 張"` style keys, they will not interpolate. Either keep all admin strings literal-only or extend `t()` symmetrically with the customer FE fix from `customer-frontend.md`'s review note.

> **Review note (2026-04-28) — `Tabs` import alias and existing usage:** the plan says `Tabs` is "already in `admin-frontend/src/components/ui/tabs.tsx` and used by `ProductList.tsx`" — verified the file exists at that path. The recommended import in Step 7 (`import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';`) matches the project's `@/*` Vite path alias. Confirmed.

> **Review note (2026-04-28) — no existing `ContentBlocksPage.spec.tsx`:** Step 3 in Testing says "extend existing, if any" for `ContentBlocksPage.spec.tsx`. There is **no existing spec file** for `ContentBlocksPage`. The test suite under `admin-frontend/src/lib/content-keys.spec.ts` covers a different concern. So Step 3 is creating a new file, not extending one — re-word the Testing section accordingly. Also: the file naming convention in `admin-frontend` is `*.spec.ts(x)` (verified by grep), matching the plan.

> **Review note (2026-04-28) — Sidebar label vs page header:** the sidebar entry label `nav.contentBlocks` (`內容區塊`) is the only header text after this refactor, since the `<h1>` inside `ContentBlocksPage` is being kept and reads from the same key. Be careful not to change `nav.contentBlocks` in this ticket: an earlier discussion in the PRD considered renaming to "首頁內容" but the current plan explicitly keeps it. Confirmed by reading `admin-frontend/src/i18n/zh.json:9` where `nav.contentBlocks = "內容區塊"`. Leave untouched.

> **Review note (2026-04-28) — defaultValue mismatch with screenshot text:** the screenshot shows `首頁輪播圖 ｜ 首頁下方區塊` with a `｜` (full-width pipe) separator visually between the two tabs. shadcn `TabsList` renders triggers side-by-side without a visual separator. The implementer should NOT add a literal `｜` glyph between triggers — it would render as part of the second tab's label. Use `TabsList` default styling and treat the screenshot's `｜` as a visual cue from the design tool, not a piece of the copy. Add this as a one-liner in Notes to prevent confusion during code review.

---

> **Review note (2026-04-29) — most of this plan is already implemented; only the multi-line subtitle delta is still pending.** Verified by reading the working tree:
>
> - `admin-frontend/src/routes/dashboard/content-blocks/HeroSlideForm.tsx` — exists. Currently uses `<Input>` for `subtitle_zh` / `subtitle_en` (lines 98 and 101) and the Zod schema has `subtitle_zh: z.string().trim().min(1).max(500)` (line 26). Both must change as part of this delta:
>   - swap `<Input>` → `<Textarea rows={3}>` on lines 98 and 101 (import `Textarea` from `@/components/ui/textarea`),
>   - drop the `.trim()` from `subtitle_zh` so admin-entered leading/trailing `\n` survives Zod parsing,
>   - render `t('heroSlides.subtitleHint')` as a small muted `<p>` under each subtitle field.
> - `admin-frontend/src/routes/dashboard/content-blocks/HeroSlidesPanel.tsx` — exists with the `subtitle_en?.trim() ? ... : null` empty-collapse already in place (line 49). Note: `subtitle_zh` is currently sent verbatim with no trim (line 48). That is correct for newline preservation, but it also means a Zod-passing string of `"a\n"` survives end-to-end. Acceptable.
> - `admin-frontend/src/routes/dashboard/content-blocks/HeroSlidesPanel.tsx` — the row preview already uses `line-clamp-1` (line 179) with the default `whitespace-normal`. With default whitespace handling, embedded `\n` characters collapse to a single space, so a multi-line subtitle reads as `line1 line2` truncated to one line. **Do not add `whitespace-pre-line` to this `<p>`** — it would defeat `line-clamp-1` and let the row grow vertically. The asymmetry (admin: collapsed one-liner; storefront: preserved line breaks) is intentional and worth restating in Notes.
> - `admin-frontend/src/routes/dashboard/content-blocks/ContentBlocksPage.tsx` and `BottomBlocksPanel.tsx` — already match Step 7 / Step 3. No further work in those files for the multi-line delta.
> - `admin-frontend/src/components/hero-slides/HeroSlideImageUploader.tsx` — already created (Option A). No further decision needed for Step 4.
> - `admin-frontend/src/queries/useHeroSlides.ts` — already created. Note the actual file name is camelCase `useHeroSlides.ts` (matching `useContentBlocks.ts`), not the kebab-case `use-hero-slides.ts` the plan suggests on line 24. Don't rename.
> - `admin-frontend/src/i18n/zh.json` — `heroSlides` namespace already exists (line 139). Adding `subtitleHint` is purely additive.
>
> **Net: the surviving scope of this ticket is (a) Form's Textarea + schema-trim + hint string, (b) hero-carousel.tsx `whitespace-pre-line`, (c) i18n `subtitleHint` keys, (d) the new manual test. Mark the rest of the steps as "already in place — verify only" rather than "implement".**

> **Review note (2026-04-29) — `subtitle_size` Select is missing from the plan:** the actual `HeroSlideForm.tsx` has a `<Select>` for `subtitle_size` (lines 126–145) bound to `HERO_SLIDE_TEXT_SIZES = ['xs','sm','md','lg','xl']`, and `frontend/src/components/home/hero-carousel.tsx` applies a per-size class via `subtitleSize(slide)` on the `<p>` (lines 69 / 127). The size class only changes the `text-*` font-size — it is independent of `whitespace-pre-line` and does not affect line-break rendering. No code change here, but the implementer should be aware the subtitle `<p>`'s final classList ends up being `max-w-lg whitespace-pre-line text-white/90 ${SUBTITLE_SIZE_CLASSES[slide.subtitle_size]}` and order matters only insofar as Tailwind utilities don't conflict — they don't. The doc should mention `subtitle_size` exists so a reviewer doesn't think it was forgotten.

> **Review note (2026-04-29) — backend already accepts `\n` end-to-end; nothing to change server-side, but document the contract:**
>
> - `backend/src/admin/dto/upsert-hero-slide.dto.ts` validates `subtitle_zh` / `subtitle_en` with only `@IsString() + @MaxLength(500)`. JS `String.length` counts `\n` as 1 char, so a 2-line subtitle of e.g. `"line1\nline2"` (11 chars) passes cleanly. There is **no** `@Matches(/.../)` or transform that would strip newlines. Confirmed safe.
> - `backend/src/admin/hero-slides-admin.service.ts` writes `subtitle_zh: dto.subtitle_zh` verbatim (line 75) on `create` and `payload.subtitle_zh = dto.subtitle_zh` on `update` (line 101) — no `.trim()`, no normalisation. Confirmed safe.
> - `normalizeNullable()` (lines 16–20 of the same file) is applied to **`subtitle_en` only**. It returns `null` when `value.trim() === ''`. **Edge case worth surfacing:** an admin who enters a subtitle of pure whitespace + newlines (e.g. `"\n\n"`) into the optional `subtitle_en` field will have it coerced to `null`, which then falls back to the ZH variant on the storefront. This is the desired behaviour, but call it out as a Notes bullet so future readers don't try to "fix" it. The ZH field is `min(1)` after `.trim()` is dropped — Zod's `.min(1)` still rejects an empty string, but it would now **accept** `"\n"` (length 1), which would render as a single blank line. If that bothers QA, add `.refine((s) => s.trim().length > 0, ...)` to the ZH schema instead of putting `.trim()` back. Pick one path and document it.
>
> Add a sentence in the Notes section: "Backend does not transform subtitle text. `\n` survives DTO validation (`@MaxLength` only), service write (`dto.subtitle_zh` passed through), and Postgres `text` storage. The only normalisation on the path is `normalizeNullable` for the **EN** variant, which collapses pure-whitespace input to `null` — this is intentional and matches the bottom-blocks behaviour."

> **Review note (2026-04-29) — fallback logic on the storefront treats whitespace-only subtitle_en as missing:** `frontend/src/components/home/hero-carousel.tsx:42` reads `slide.subtitle_en?.trim() ? slide.subtitle_en : slide.subtitle_zh`. With the BE coercing pure-whitespace EN to `null` (see prior note), this branch is mostly defensive. But: if a future BE bug lets a non-null whitespace EN through, the storefront would still fall back to ZH thanks to this `.trim()` test. Don't change this line as part of this delta — `pickSubtitle` returning a string with embedded `\n` works correctly under `whitespace-pre-line`. Just don't try to `.trim()` the returned value before rendering, or you'll strip the leading newline that `.trim()` on the schema was specifically dropped to preserve.

> **Review note (2026-04-29) — seed row backwards-compatibility under `whitespace-pre-line`:** `documents/FEAT-14/development/database-schema.md` Step 5 inserts a single seed row with single-line subtitles (`'用心烘焙，傳遞幸福'` / `'Baked with heart, shared with love'`). `whitespace-pre-line` only honours `\n` characters that are present in the string; it does not introduce wrapping where none exists. Existing single-line rows therefore render identically to today (one centred line). No seed-data update is needed for the delta. If the team wants to demo the multi-line behaviour by default after deploy, they can `UPDATE` the seed row's `subtitle_zh` to `'手作，健康！\n無添加任何化學添加物！'` post-migration, but that is **not in scope** for this ticket — note it as an optional follow-up.

> **Review note (2026-04-29) — `max-w-lg` + `text-center` + multi-line:** confirmed the parent in both `StaticSlide` (line 65) and `CarouselSlides` (line 123) carries `flex flex-col items-center ... text-center`. With `whitespace-pre-line`, the `<p className="max-w-lg ...">` becomes a constrained-width block whose inline content is split into multiple lines at each `\n`. Each line independently inherits `text-center`, so a 2-line block looks visually centred as a stack. The `max-w-lg` (32rem) gates how wide a single line can grow before soft-wrap — multi-line subtitles where one line is longer than 32rem will wrap automatically (still centred). No layout regressions expected. **Visual gotcha to flag in QA:** because each line centres independently, a line ending in trailing whitespace will still appear centred (the trailing space is collapsed by `pre-line`), so admins will not see misaligned lines from accidental trailing spaces. Good.

> **Review note (2026-04-29) — `<Textarea>` Tab behaviour and `react-hook-form`:** verified `admin-frontend/src/components/ui/textarea.tsx` is the shadcn forwardRef-based primitive — `register('subtitle_zh')` will attach refs cleanly. Tab moves focus by default (browser native), so the form remains keyboard-navigable. The plan's note on this is correct; no extra `onKeyDown` handler is needed and adding one would break the form's a11y. The textarea also has `field-sizing-content min-h-16` which means it auto-grows with content (modern browsers via the `field-sizing` CSS property). `rows={3}` is therefore an initial-height hint, not a hard cap — the field will expand as the admin types more lines. This is desirable and should be called out so a reviewer doesn't try to add a `max-rows`/`overflow-auto` constraint.

> **Review note (2026-04-29) — no existing tests assert on subtitle content; nothing to migrate:** searched the entire repo for `*.spec.*` files referencing `subtitle` or `hero` — only `frontend/src/i18n/merge-overrides.spec.ts` references `home.hero.title`, and that's a different `hero.*` namespace (the legacy hard-coded hero text in JSON). No existing test pins `subtitle_zh` content or its rendering. The new `HeroSlideForm.spec.tsx` proposed in Testing Step 1 is the first such test. No backwards-compat test risk.

> **Review note (2026-04-29) — image_url schema in actual file already differs from plan:** the live `HeroSlideForm.tsx` (line 28) uses `image_url: z.string().min(1).url()` — not nullable. Step 5's example shows `z.string().url()` and Step 5's bullet says "not nullable; required" — these match in intent. Don't re-introduce `.nullable()` here while making the subtitle changes; the form depends on `image_url` being a non-null string for the uploader Controller binding (line 152: `<HeroSlideImageUploader value={field.value} ...>` expects a string). Leave `image_url` schema as-is.
