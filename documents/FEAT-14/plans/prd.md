# PRD: FEAT-14 — Homepage Hero Carousel + i18n Cleanup

## Problem Statement

The customer homepage hero (`frontend/src/app/page.tsx` lines 47–64) is a **fixed 600 px tall static block**: title and subtitle come from i18n keys (`home.title`, `home.subtitle`) and the background image is hard-coded to `hero-bakery.jpg`. The shop owner has no way, without a developer, to:

1. **Reduce the visual weight** of the hero so the product grid is reachable closer to the fold.
2. **Rotate seasonal imagery / messaging** (lunar new year mooncakes, Christmas pre-orders, "店休公告") without redeploying.
3. Run more than one promotional message at a time (today there is exactly one slot — title + subtitle + image).

The owner described the desired outcome with two reference screenshots (`截圖 2026-04-28 下午5.04.26.png` showing the framed hero on the customer storefront, and `截圖 2026-04-28 下午5.04.59.png` showing the admin "內容區塊" page with a new tab pair "首頁輪播圖 ｜ 首頁下方區塊" at the top): make the hero shorter and turn it into a carousel that the admin can populate from the existing 內容區塊 menu item.

## Solution Overview

Four changes co-shipped:

1. **Customer hero shrinks to ⅔ height** — `h-[600px]` becomes `h-[400px]` (with the existing responsive overlay / typography preserved). Below that single CSS edit, the inline `<section>` is replaced by a new `<HeroCarousel>` component driven by a list of `HeroSlide` rows fetched from the backend.

2. **`HeroCarousel` renders different visuals based on slide count** (this is the user's hard requirement):
   - **count = 0** — section is hidden entirely (no fallback to old i18n keys; an empty list is treated as "the owner does not want a hero today"). A seed migration creates one slide that mirrors today's hero, so this state only happens if the admin explicitly deletes every slide.
   - **count = 1** — renders a single static slide. **Pixel-equivalent to today's hero except for the new height.** No arrows, no pagination dots, no auto-advance timer running, no swipe gesture. The user's brief — "如果數量 = 1 個，跟現狀一樣" — is enforced by branching at the top of the component: if `slides.length === 1` we render the static path, otherwise we mount the carousel.
   - **count > 1** — renders an Embla-backed carousel with prev/next arrow buttons on the left and right edges, pagination dots underneath, and auto-advance every **4000 ms**. Auto-advance pauses on pointer/keyboard focus and resumes on blur. **Any user interaction with prev/next/dots resets the 4 s timer** (so the user always gets a full 4 s on the slide they intentionally landed on). Touch swipe is supported on mobile (free in Embla).

3. **Admin gains a `首頁輪播圖` tab inside the existing 內容區塊 page** (`/dashboard/content-blocks`), as designed in the second screenshot:
   - The route renders a top-level `<Tabs>` with two triggers — `首頁輪播圖` (the new carousel manager, default tab) and `首頁下方區塊` (the **unchanged** existing content-blocks experience moved into the second tab).
   - The carousel tab presents the same list / reorder / publish-toggle / edit / delete affordances as the bottom-blocks tab, but with `subtitle_zh` / `subtitle_en` instead of long descriptions, and the existing signed-URL image upload flow reused unchanged.

4. **i18n / `site_content` cleanup** — sweep the keys exposed by `/dashboard/content` (文案管理) for unused-but-still-stored overrides and remove them from both layers (Supabase `site_content` rows AND, where applicable, the JSON defaults in `shared/src/i18n/{zh,en}.json`). Concrete deletions confirmed for v1:
   - **`story.p1`, `story.p2`, `story.title`** — these are orphan rows from a pre-`content_blocks` era (the homepage "周爸的故事" section was migrated to `content_blocks` rows long ago). They have **no JSON defaults**, **no `t('story.…')` calls in `frontend/src` or `shared/src`**, and only show up because the content editor surfaces every `site_content` row regardless of whether it has a consumer. Delete the three rows.
   - **`home.subtitle`** — currently still consumed by `frontend/src/app/page.tsx:62` so it MUST stay until FEAT-14 ships. After the new `<HeroCarousel>` lands and replaces the inline hero, `home.subtitle` becomes unused (Header/Footer only reference `home.title`). The cleanup of `home.subtitle` (both the override row in `site_content` AND the JSON default in `shared/src/i18n/{zh,en}.json`) is sequenced **after** the carousel patch in this same ticket — see `documents/FEAT-14/development/i18n-cleanup.md` for the strict ordering.

The carousel and the bottom blocks are **two separate domain entities** stored in two different tables (`hero_slides` vs the existing `content_blocks`). They share the *admin pattern* (CRUD + reorder + publish) but the underlying schema, validation, and consumer pages are different and should not collapse into a single table.

## User Stories

1. As the **shop owner**, I want the homepage hero to be shorter so customers see "today's bread" sooner without scrolling.
2. As the **shop owner**, I want a `首頁輪播圖` tab next to `首頁下方區塊` in the 內容區塊 admin page so I manage both surfaces from the same sidebar entry.
3. As the **shop owner**, I want to upload a slide consisting of a Chinese title, an English title, a Chinese subtitle, an English subtitle, and a background image, with publish toggle and reorder controls — same affordances as the bottom blocks I already manage.
4. As the **shop owner**, I want a published slide list with one row to behave **exactly** like today's static hero (no arrows, no auto-rotation) so I can use the carousel as a single-slot hero when I'm only running one campaign.
5. As the **shop owner**, when I publish two or more slides, I want them to auto-rotate every 4 seconds so customers see all of my messages without having to interact.
6. As the **shop owner**, I want left and right arrow buttons inside the carousel so a customer who wants to go back to a previous slide is not forced to wait for a full rotation.
7. As a **customer**, when I click an arrow, the auto-rotation timer should reset so I get a full 4 s on the slide I just navigated to (it is annoying if a slide I deliberately picked rotates away in 0.5 s because it inherited the previous slide's expiring timer).
8. As a **customer**, when I hover over the carousel I want auto-advance to pause so I can read a slide without it sliding away under my cursor.
9. As a **customer** on mobile, I want to swipe left/right on the carousel as an alternative to the small arrow buttons.
10. As a **customer**, if the shop has not configured any slides at all (empty list), I want the page to still load — no broken hero box, no empty grey 400 px gap. The hero section is simply omitted.
11. As the **shop owner**, when I open `/dashboard/content` (文案管理), I do not want to see legacy "story" rows that nothing on my live storefront reads — they confuse my mental model of "what does this field do" and tempt me to edit text that has zero effect. Remove them so every visible row maps to a real surface.

## Implementation Decisions

### Modules

**Database — new `hero_slides` table**

- Columns: `id uuid PK`, `title_zh text NOT NULL`, `title_en text NULL`, `subtitle_zh text NOT NULL`, `subtitle_en text NULL`, `image_url text NOT NULL`, `position int NOT NULL DEFAULT 0`, `is_published boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.
- `image_url` is **NOT NULL** (a hero slide without a background image is meaningless), unlike `content_blocks.image_url` which is nullable. Validation enforces this at the DTO layer too.
- Index `(is_published, position)` to keep the public read sorted-and-filtered scan trivial.
- `updated_at` trigger reuses the project's existing `public.set_updated_at` (per CLAUDE.md — not the legacy `update_updated_at_column`).
- RLS enabled with no policies; service role bypasses, matching `content_blocks`.
- **Seed migration** inserts exactly one row mirroring today's hero so existing deployments visually do not change on rollout:
  ```sql
  INSERT INTO public.hero_slides (title_zh, title_en, subtitle_zh, subtitle_en, image_url, position, is_published)
  VALUES (
    '周爸烘焙坊', 'Papa Bakery',
    '用心烘焙，傳遞幸福', 'Baked with heart, shared with love',
    'https://wqgaujuapacxuhvfatii.supabase.co/storage/v1/object/public/product-images/hero-bakery.jpg',
    0, true
  );
  ```

**Backend — new `HeroSlidesModule`** (`backend/src/hero-slides/`)

Mirrors the existing `content-blocks` module exactly (deep + shallow copy of structure, not behaviour).

- `hero-slides.module.ts`, `hero-slides.controller.ts`, `hero-slides.service.ts`.
- Public `GET /api/hero-slides` — returns `{ items: HeroSlide[] }` filtered to `is_published = true` and ordered by `position ASC`. No auth, no session, idempotent. The customer FE is the only consumer.
- The service injects `SupabaseService` from the global module and uses `getClient()` (data role).

**Backend — admin CRUD lives under the existing `AdminModule`**

Two new files alongside the existing `content-blocks-admin.{controller,service}.ts`:

- `backend/src/admin/hero-slides-admin.controller.ts` — guarded by `AdminAuthGuard`; exposes `GET /api/admin/hero-slides`, `POST /api/admin/hero-slides`, `PATCH /api/admin/hero-slides/reorder`, `PATCH /api/admin/hero-slides/:id`, `DELETE /api/admin/hero-slides/:id`.
- `backend/src/admin/hero-slides-admin.service.ts` — list (no `is_published` filter), `create`, `update`, `delete`, `reorder`. Logic is line-by-line equivalent to `ContentBlocksAdminService` with three deltas: (a) the table name, (b) `subtitle_zh` / `subtitle_en` instead of `description_zh` / `description_en`, (c) `image_url` is required on create (the service throws `BadRequestException` if blank).
- New DTOs in `backend/src/admin/dto/`: `upsert-hero-slide.dto.ts` and `reorder-hero-slides.dto.ts`. `class-validator` decorators mirror `upsert-content-block.dto.ts` plus `@IsUrl()` on `image_url` and `@IsNotEmpty()` on `subtitle_zh`.
- The existing **`POST /api/admin/uploads/content-image` endpoint is reused unchanged** for hero slide uploads — no new upload route. Both surfaces drop files into the same Storage bucket; admins can move images between slides and bottom blocks if they want.

**Shared types** (`shared/src/types/hero-slide.ts`, new file)

```ts
export interface HeroSlide {
  id: string;
  title_zh: string;
  title_en: string | null;
  subtitle_zh: string;
  subtitle_en: string | null;
  image_url: string;          // not nullable
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
export interface ReorderHeroSlidesRequest { ids: string[]; }
export interface HeroSlidesResponse { items: HeroSlide[]; }
export type AdminHeroSlidesResponse = HeroSlidesResponse;
```

Re-exported from `shared/src/index.ts` so both FE workspaces import it as `import { HeroSlide } from '@repo/shared'`.

**Customer frontend — new `<HeroCarousel>`** (`frontend/src/components/home/hero-carousel.tsx`)

- Public surface: `<HeroCarousel />` — no props; it queries its own data via `useHeroSlides()`.
- `useHeroSlides()` (new file `frontend/src/queries/use-hero-slides.ts`) — TanStack Query against `/api/hero-slides`, default `staleTime`. The default queryFn already routes `['api','hero-slides']` to that URL via `stringifyQueryKey`, so the hook is one line: `useQuery<HeroSlidesResponse>({ queryKey: ['api','hero-slides'] })`.
- The component's render logic:
  - `data === undefined` (still loading first paint after SSR) → render a static placeholder div with `h-[400px]` and `bg-bg-elevated` to reserve layout. Don't render `<Image>` to avoid a layout flash with no src.
  - `slides.length === 0` → return `null`. The `<section>` simply does not exist.
  - `slides.length === 1` → render the **static path**: a single `<section>` with `h-[400px]`, the slide's `image_url` as the `<Image>`, and the title / subtitle exactly as today. No carousel chrome.
  - `slides.length > 1` → render the **carousel path** (see below).
- Carousel implementation: `embla-carousel-react` + `embla-carousel-autoplay`. Settle on the shadcn `carousel` recipe (`npx shadcn@latest add carousel` adds `frontend/src/components/ui/carousel.tsx` if it isn't already). Configure the autoplay plugin with `delay: 4000`, `stopOnInteraction: false`, `stopOnMouseEnter: true`. Reset the timer on prev/next click via `plugin.current.reset()` (Embla's documented API).
- Arrow buttons absolutely positioned on the left and right inside the 400 px frame; styled to match the brand palette (`text-white`, semi-transparent dark hover, ≥ 40 × 40 px tap target). Pagination dots row beneath the title/subtitle. Live region (`aria-live="polite"`) announces "第 N 張，共 M 張 — {title}" on slide change.
- Locale handling matches the current hero: `useLocale()` returns `locale` and `t`. For each slide we pick `locale === 'en' ? (slide.title_en ?? slide.title_zh) : slide.title_zh` (and the same for subtitle) — fall back to zh when the en field is null/empty, identical to how `name_zh`/`name_en` fall back elsewhere.
- `frontend/src/app/page.tsx` lines 47–64: replace the inline `<section>` with `<HeroCarousel />` and delete the now-unused `STORAGE_URL` constant + `Image` import (verify the import isn't used anywhere else in the file before deleting). The seasonal banner / header / products grid / process / content blocks sections are untouched.

**Operational — `site_content` cleanup** (executed via Supabase MCP; see `documents/FEAT-14/development/i18n-cleanup.md`)

- Phase A (ships with this ticket, **before** the FE deploy): `DELETE FROM public.site_content WHERE key IN ('story.p1', 'story.p2', 'story.title');`. These three rows are confirmed orphan: no `t('story.…')` calls anywhere in `frontend/src` or `shared/src`, no JSON defaults under `home/story/...` in `shared/src/i18n/{zh,en}.json`, no documented future use. Removing them does not break any FE rendering — `home-content-blocks.tsx` reads from the `content_blocks` table, not from i18n.
- Phase B (executed **after** the FE patch deploys): remove `home.subtitle` from `site_content` (`DELETE FROM public.site_content WHERE key = 'home.subtitle';`) AND from `shared/src/i18n/{zh,en}.json`. The reason for the sequencing: phase B's row deletion is reversible (the JSON default keeps the editor happy if we forget), but if we delete the JSON default *before* the FE patch ships, the existing hero falls back to an empty string for one render. Strict order: ship FE patch → confirm carousel renders → run phase B.
- The cleanup intentionally does NOT remove rows that have JSON defaults but happen to have identical override values (e.g. an admin saving `home.title = 周爸烘焙坊` over the default). Those rows are a no-op at render time but represent intentional admin action and should be left alone.

**Admin frontend — split `/dashboard/content-blocks` into a tabbed page**

- `admin-frontend/src/routes/dashboard/content-blocks/ContentBlocksPage.tsx` becomes a thin shell that wraps two `<Tabs>` triggers using the existing `components/ui/tabs.tsx` (Radix-backed; same component already used by `ProductList.tsx`).
  - Default tab: `首頁輪播圖` — renders new `HeroSlidesPanel.tsx`.
  - Second tab: `首頁下方區塊` — renders the existing list/edit/delete code, lifted into `BottomBlocksPanel.tsx` (verbatim move; no behaviour changes).
- `HeroSlidesPanel.tsx` is a near-copy of the existing `BottomBlocksPanel.tsx` with three deltas: (a) imports `useAdminHeroSlides` / `useCreateHeroSlide` / `useUpdateHeroSlide` / `useDeleteHeroSlide` / `useReorderHeroSlides` instead of the content-blocks hooks; (b) renders `HeroSlideForm.tsx` instead of `ContentBlockForm.tsx`; (c) the row card shows `subtitle_zh` instead of the multi-line description.
- `HeroSlideForm.tsx` mirrors `ContentBlockForm.tsx` with `subtitle_zh` / `subtitle_en` short `<Input>`s in place of the long `<Textarea>` description fields, and `image_url` is **required** (Zod `.min(1, 'image is required')` instead of `.nullable()`).
- New TanStack hooks file `admin-frontend/src/queries/useHeroSlides.ts` mirrors `useContentBlocks.ts` 1-for-1, swapping URL paths and types.
- Sidebar (`admin-frontend/src/components/layout/Sidebar.tsx`) is **unchanged** — the user's screenshot shows the carousel manager living *under* the existing 內容區塊 sidebar item, not as a new sidebar entry.
- New i18n keys under `admin-frontend/src/i18n/zh.json` (and `en.json`):
  - `nav.contentBlocks` is unchanged.
  - New section `heroSlides`: `tabHeroSlides`, `tabBottomBlocks`, `addNew`, `titleZh`, `titleEn`, `subtitleZh`, `subtitleEn`, `image`, `isPublished`, `empty`, `created`, `updated`, `deleted`, `saveFailed`, `deleteFailed`, `reorderFailed`, `uploadFailed`, plus the verbs already used by content blocks. The `BottomBlocksPanel.tsx` continues to use the existing `contentBlocks.*` keys — no rename.

### Architecture

- **Two tables, not one.** `hero_slides` and `content_blocks` look superficially similar but they have different consumer pages, different validation (image required vs nullable, subtitle vs long description), and different evolution paths (a future per-slide CTA link belongs on `hero_slides`, not on bottom blocks). Collapsing them into a single `home_sections` table with a `kind` enum would couple the bottom-blocks editor's long-description UX to the carousel slide's short-subtitle UX and force every form to branch on `kind`. The duplication on the admin side is shallow (≈100 lines of glue) and worth it for surface independence.
- **Two-table mirrors the admin design too.** The screenshot puts the two managers behind sibling tabs of one sidebar item; that is a *UI* consolidation, not a *schema* consolidation. The tabs render two completely independent panels that just happen to share a route.
- **Empty-list = section omitted.** When the admin deletes every slide, the customer page has no hero — not a fallback to the legacy hard-coded image. Reasoning: any fallback obscures an admin error (they intended to delete one and accidentally deleted all) and adds a code path that exists only for one-time migration. The seed row removes the practical risk that this state is reached in production unintentionally.
- **Carousel branching at `length === 1`.** Mounting Embla for a one-slide list and then disabling the plugin works *almost* identically — but the user explicitly asked for "跟現狀一樣" when there is exactly one slide. Honouring that literally (don't mount the carousel at all) means there is zero risk of an accidental visual regression from a stray `<button>` rendering on the single-slide path.
- **Auto-advance reset semantics.** Embla's autoplay plugin exposes `.reset()` which restarts the timer with the configured delay. Wiring it to the prev/next click handlers AND to the dot click handler avoids a "0.5 s on a slide I just clicked into" papercut. `stopOnInteraction: false` keeps the carousel rotating after the click; only **hover** (`stopOnMouseEnter: true`) and keyboard focus pause it indefinitely.
- **Hover pause covers desktop only.** On mobile there is no hover. We rely on the user's swipe / tap on a dot to reset the timer; we do **not** pause auto-advance on touch because the touch event ends quickly. This matches industry default (Apple, Shopify defaults).
- **Image required at the slide layer, optional at the bottom-block layer.** `content_blocks.image_url` is nullable today (some bottom blocks render text-only). A hero slide without an image is a 400 px tall white box and never makes sense, so we enforce NOT NULL at the column AND at the DTO. The admin form's submit button stays disabled until an image is uploaded.
- **No CSS overlap with the seasonal banner.** `<SeasonalBanner />` (line 45) renders above the hero. Reducing the hero from 600 to 400 px does not affect the banner; no layout interaction beyond the cumulative scroll-depth shrinking.
- **`Header` and `Footer` continue to read `home.title` from i18n.** This ticket does NOT touch the masthead / footer brand text. The hero slide title is intentionally a separate field from the masthead brand: the brand is "周爸烘焙坊" forever, while the hero slide title can be a campaign headline like "中秋月餅預購中".

### APIs/Interfaces

**Public**

```
GET /api/hero-slides
→ {
    items: [
      {
        id: "uuid",
        title_zh: "周爸烘焙坊",
        title_en: "Papa Bakery",
        subtitle_zh: "用心烘焙，傳遞幸福",
        subtitle_en: "Baked with heart, shared with love",
        image_url: "https://.../hero-bakery.jpg",
        position: 0,
        is_published: true,
        created_at, updated_at
      },
      ...
    ]
  }
```

Items filtered to `is_published = true`, ordered by `position ASC`. Always 200 (empty `items: []` if no slides published).

**Admin**

```
GET    /api/admin/hero-slides            → AdminHeroSlidesResponse  (no is_published filter, ordered by position)
POST   /api/admin/hero-slides            body: CreateHeroSlideRequest          → HeroSlide
PATCH  /api/admin/hero-slides/reorder    body: ReorderHeroSlidesRequest        → AdminHeroSlidesResponse
PATCH  /api/admin/hero-slides/:id        body: UpdateHeroSlideRequest          → HeroSlide
DELETE /api/admin/hero-slides/:id                                              → 204
POST   /api/admin/uploads/content-image  (REUSED — no change)                  → SignedUrlResponse
```

All admin routes guarded by `AdminAuthGuard`. Validation: `title_zh`, `subtitle_zh`, `image_url` non-empty on create; URLs must pass `class-validator`'s `@IsUrl()`.

## Testing Strategy

- **Backend unit — `hero-slides-admin.service.spec.ts` (new)**:
  - `create` rejects with 400 when `image_url` is empty.
  - `create` rejects when `subtitle_zh` is whitespace-only.
  - `reorder` returns 404 when an id in the request body does not exist (mirrors content-blocks coverage).
  - Position auto-increments on create (next position = max + 1).

- **Backend integration — `hero-slides.controller.e2e-spec.ts` (new)**: seed three slides, two published; `GET /api/hero-slides` returns exactly the two published rows ordered by position; toggle one to draft via admin endpoint, GET again → that row drops out.

- **Backend integration — `hero-slides-admin.controller.e2e-spec.ts` (new)**: full CRUD round-trip with admin Bearer; reorder swaps positions; non-admin Bearer gets 403.

- **Customer frontend unit — `hero-carousel.spec.tsx` (new)**:
  - Render with empty `slides` → component returns `null` (assertion: query for the carousel root → not in document).
  - Render with one slide → assertion: no `[aria-label="Previous slide"]` / `[aria-label="Next slide"]` buttons in DOM.
  - Render with three slides → arrows present, dots present, autoplay timer mocked to advance the slide after 4 s.
  - Click "next" → assertion: autoplay's `.reset` was called (spy / wrapped plugin).
  - Hover the carousel → autoplay pauses (Embla's `autoplay.isPlaying()` returns false).

- **Customer frontend manual** — open `/`, verify the hero is visibly shorter than before. With seeded single slide, confirm parity with the pre-FEAT-14 hero (no chrome, no rotation). Add a second slide via admin, refresh customer FE, confirm arrows + dots + 4 s rotation. Mobile: confirm swipe works.

- **Admin frontend unit — `HeroSlidesPanel.spec.tsx` (new)**: tab switch toggles between hero panel and bottom-blocks panel; create flow opens the dialog; submit with empty image surfaces the field error.

- **Admin frontend unit — `ContentBlocksPage.spec.tsx`** (extend existing, if any): default tab is `首頁輪播圖`; switching to `首頁下方區塊` shows the legacy list intact.

- **Admin frontend manual** — at `/dashboard/content-blocks`, confirm the two tabs render. Add a slide, toggle publish, reorder via the up/down arrows, delete. Confirm the customer storefront reflects each change after refresh (no realtime — TanStack Query staleTime is 60 s, manual refresh is fine).

- **QA checklist** at `documents/FEAT-14/development/qa-checklist.md` (optional v1.1) — covers the seeded-single-slide rollout, the visual regression test of the height change, and the cross-locale rendering of slides with only zh fields filled in.

## Out of Scope

- **Auto-pruning of `site_content` rows.** This ticket removes only specifically-confirmed orphan keys (`story.*`, `home.subtitle` post-FE-patch). It does NOT add a backend job that automatically deletes any `site_content` row whose key is no longer in the JSON defaults. A future maintenance ticket can layer that on if the orphan-row count grows again.
- **Per-slide CTA / deep link / button.** Slides are visual only in v1. A future ticket can add `link_url` + `link_label_zh` / `link_label_en` columns on `hero_slides` plus a `<Link>` wrapping the slide content.
- **Per-slide schedule (start_at / end_at).** Today the only on/off control is the `is_published` toggle. Time-windowed slides ("publish from Apr 28 09:00 until May 5 23:59") are out of scope.
- **Realtime push to the customer FE when admin updates a slide.** TanStack Query's 60 s staleTime + manual refresh is the v1 contract. No Supabase realtime channel.
- **Image cropping / focal point selection in admin.** Slides use `object-cover` with the natural focal centre. Owners pre-crop their images.
- **Animations beyond the default Embla slide.** No fade, no Ken Burns, no parallax. Pure horizontal slide transition.
- **Per-slide background colour / overlay opacity.** All slides reuse the existing `--bg-overlay` for legibility. No per-slide override.
- **Responsive breakpoints for the carousel chrome.** Arrows and dots use the same size on mobile and desktop. Specific tablet polish, if needed, is a follow-up.
- **i18n editor integration.** The slide's `title_zh` / `title_en` are stored on the `hero_slides` row directly. They are NOT part of the `site_content` overrides table. The 文案管理 admin page does not gain hero slide rows.
- **Replacing the masthead / footer brand text.** `Header` and `Footer` continue to read `home.title` from i18n; this ticket does not touch them.
- **Bulk image upload.** One slide, one image, one upload — same as bottom blocks.
- **Per-slide CTA analytics.** No click tracking on the carousel arrows or pagination dots.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete

> **Review notes (cross-cutting, 2026-04-28).** A reviewer audited the full FEAT-14 plan against the codebase; per-document gaps are flagged inline in `database-schema.md`, `backend-api.md`, `customer-frontend.md`, `admin-frontend.md`, and `i18n-cleanup.md`. The two highest-priority cross-cutting issues:
>
> 1. **`useLocale().t()` does not interpolate placeholders.** `frontend/src/hooks/use-locale.ts:44–58` and `admin-frontend/src/hooks/use-locale.ts:44–58` both implement `t(key)` as a plain dotted-path lookup with no `{n}` / `{total}` substitution. The customer-frontend plan calls `t('home.carouselSlideOf', { n, total })` which silently ignores the second argument and renders literal `"第 {n} 張，共 {total} 張"` text in the live region and dot ARIA labels. Decision needed before implementation: extend `t()` to accept a params object and substitute `\{(\w+)\}` tokens, OR drop placeholders and assemble strings in the component.
> 2. **DTO design clashes with PATCH semantics.** `backend-api.md` Step 5 sketches `UpsertHeroSlideDto` with `@IsNotEmpty()` on required fields and reuses the same DTO for `PATCH /:id`. The existing `UpsertContentBlockDto` deliberately marks every field `@IsOptional()` because shared-DTO + global `ValidationPipe` + PATCH-with-partial-body cannot otherwise pass validation (e.g. a `is_published` toggle from the row Switch sends `{ is_published: false }`, which would 400 on missing `title_zh`). Follow the content-blocks pattern: keep all DTO fields optional, enforce required-ness in `HeroSlidesAdminService.create` only.
>
> Other notable gaps flagged in the per-doc files: missing `supabase/migrations/` directory (use Supabase MCP `apply_migration`), production deploy ordering (migration → BE → FE), shadcn `Carousel` `onClick` forwarding & `Autoplay.reset()` semantics while paused, the `<h1>` + "Add new" button shared row in `ContentBlocksPage.tsx` lift, the SSR-skeleton-as-LCP regression on the customer hero, and `useSiteContent` staleTime vs Phase B deletion timing.
