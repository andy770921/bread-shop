# Implementation Plan: Customer Frontend Display

## Overview

Add a `<HomeContentBlocks />` client component that fetches published content blocks and renders them stacked at the bottom of the homepage. Each block uses the responsive 2-column layout inherited from the retired `<StorySection />`, with:

- **Image side alternating on desktop only** — even index → image right, odd → image left.
- **Background alternating ABAB on all breakpoints** — A = `var(--primary-50)` solid, B = `var(--process-bg)` diagonal gradient.
- **Uniform mobile stacking order** — all blocks render `title → description → image` on narrow viewports; side-flipping only applies at `lg` and above.

Handles image-less blocks, line-break-containing descriptions, and an empty list gracefully.

This component **replaces** the old hardcoded `<StorySection />` — the story content now lives as the first content block (position 0) in the database.

## Files to Modify

### Frontend Changes

- `frontend/src/components/home/home-content-blocks.tsx` — NEW
- `frontend/src/queries/use-content-blocks.ts` — NEW
- `frontend/src/app/page.tsx` — remove `<StorySection />` import and usage; render `<HomeContentBlocks />` directly after `<ProcessSection />`.
- `frontend/src/components/home/story-section.tsx` — **DELETED** (story migrated to a content block).

## Step-by-Step Implementation

### Step 1: Query hook

**File:** `frontend/src/queries/use-content-blocks.ts`

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import type { ContentBlocksResponse } from '@repo/shared';

export function useContentBlocks() {
  return useQuery<ContentBlocksResponse>({
    queryKey: ['api', 'content-blocks'],
  });
}
```

**Rationale:**

- Leverages the shared default `queryFn` + `stringifyQueryKey` — the tuple `['api', 'content-blocks']` resolves to `GET /api/content-blocks` automatically.
- `staleTime: 60s` (from the shared provider defaults) is fine — this content changes a few times per week at most.
- `credentials: 'include'` is set in the shared `fetchApi` wrapper; content blocks don't need the session cookie, but including it is harmless.

### Step 2: Component

**File:** `frontend/src/components/home/home-content-blocks.tsx`

```tsx
'use client';

import Image from 'next/image';
import { useLocale } from '@/hooks/use-locale';
import { useContentBlocks } from '@/queries/use-content-blocks';
import type { ContentBlock } from '@repo/shared';

export function HomeContentBlocks() {
  const { data } = useContentBlocks();
  const { locale } = useLocale();
  const items = data?.items ?? [];
  if (!items.length) return null;

  return (
    <>
      {items.map((block, index) => (
        <ContentBlockRow
          key={block.id}
          block={block}
          locale={locale}
          imageSide={index % 2 === 0 ? 'right' : 'left'}
          tinted={index % 2 === 0}
        />
      ))}
    </>
  );
}

function ContentBlockRow({
  block,
  locale,
  imageSide,
  tinted,
}: {
  block: ContentBlock;
  locale: 'zh' | 'en';
  imageSide: 'left' | 'right';
  tinted: boolean;
}) {
  const title = locale === 'en' && block.title_en ? block.title_en : block.title_zh;
  const description =
    locale === 'en' && block.description_en ? block.description_en : block.description_zh;
  const hasImage = !!block.image_url;

  return (
    <section
      className="py-16 lg:py-24"
      style={{ background: tinted ? 'var(--primary-50)' : 'var(--process-bg)' }}
      aria-labelledby={`content-block-${block.id}`}
    >
      <div className="container mx-auto px-4">
        <div
          className={
            hasImage
              ? 'grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16'
              : 'mx-auto max-w-3xl text-center'
          }
        >
          <div
            className={hasImage ? (imageSide === 'right' ? 'lg:order-1' : 'lg:order-2') : undefined}
          >
            <h2
              id={`content-block-${block.id}`}
              className="font-heading text-2xl font-bold lg:text-3xl"
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
            <p
              className="mt-6 whitespace-pre-line text-base lg:text-lg"
              style={{ color: 'var(--text-secondary)' }}
            >
              {description}
            </p>
          </div>
          {hasImage && (
            <div
              className={`relative h-[360px] overflow-hidden rounded-2xl lg:h-[460px] ${
                imageSide === 'right' ? 'lg:order-2' : 'lg:order-1'
              }`}
            >
              <Image
                src={block.image_url!}
                alt={title}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
```

**Rationale:**

- Reuses the retired `StorySection` layout classes (`py-16 lg:py-24`, `grid grid-cols-1 lg:grid-cols-2`, `h-[360px] lg:h-[460px]`, `object-cover`) so the first content block (the migrated story) looks pixel-identical to the old hardcoded one.
- **`whitespace-pre-line`** preserves paragraph breaks typed into the admin textarea without needing Markdown. This is critical for the migrated story block, whose description is `p1\n\np2`, and for future multi-paragraph announcements.
- **Image side** is derived from `index` — no DB column. Even indices put the image on the right (block 0 = former story layout); odd indices flip for variety. The flip classes are **`lg:order-*`**, not plain `order-*`, so they only apply at `lg` (≥ 1024 px). On mobile the single-column grid renders whatever the DOM order is — which is text first, image second — giving every block a uniform `title → description → image` reading order. Using unscoped `order-*` would flip odd rows on mobile too, putting a photo above its title, which is confusing on a phone.
- **Background tint** is derived from the same index via the `tinted` prop. Even indices keep the solid `var(--primary-50)` cream (story-section feel); odd indices use `var(--process-bg)` — the same diagonal gradient (`linear-gradient(135deg, --primary-50 0% → --primary-100 100%)`) that the Process section already uses. We use the CSS `background` shorthand (not `backgroundColor`) so both solid colors and gradients flow through one prop.
- No-image fallback centers the text in a `max-w-3xl` column — good for pure announcements / shipping info.
- `aria-labelledby` + per-block heading id keeps the section structure accessible when multiple blocks stack.

### Step 3: Render on the homepage

**File:** `frontend/src/app/page.tsx`

**Change:** remove the `StorySection` import and usage; render `<HomeContentBlocks />` directly after `<ProcessSection />`.

```tsx
// Remove these lines:
// import { StorySection } from '@/components/home/story-section';
// <StorySection />

// Keep:
import { HomeContentBlocks } from '@/components/home/home-content-blocks';
// ...
<ProcessSection />
<HomeContentBlocks />
<Footer />
```

**Rationale:** Page order is now Hero → Categories → Featured Products → Process → **ContentBlocks** → Footer. The old story section has been removed because the story itself is now the first content block (position 0) in the database — rendered by `<HomeContentBlocks />` with identical layout. The migrated block keeps the same right-side image placement (index 0 → `imageSide='right'`) and cream background (`tinted=true`), so visually the homepage looks the same to a returning customer.

### Step 4: Jest test

**File:** `frontend/src/components/home/home-content-blocks.spec.tsx`

Cover:

1. Returns null when `items` is empty.
2. Renders one `<section>` per item.
3. Under `locale=en`, falls back to `title_zh` when `title_en` is null.
4. Block without `image_url` does not render an `<img>`.
5. Image side alternates **on desktop** (classes `lg:order-1`/`lg:order-2`): index 0 → text `lg:order-1` (image right), index 1 → text `lg:order-2` (image left).
6. Mobile DOM order is uniform: for every block, the text container precedes the image container in the DOM so that on viewports under `lg` (no `order` override) the visual order is title → description → image.
7. Background alternates ABAB: index 0 inline style `background: var(--primary-50)`, index 1 `background: var(--process-bg)`, index 2 `background: var(--primary-50)`.

**Rationale:** These are the rules most likely to regress during future refactors; covering them with RTL makes the behavior explicit.

## Testing Steps

1. `cd backend && npm run start:dev` + `cd frontend && npm run dev`.
2. With zero content blocks: homepage renders process section followed directly by the footer — no empty gap, no orphaned story section.
3. With the seeded "周爸的故事" block at position 0: homepage renders it with image on the right and solid `--primary-50` background, visually identical to the former hardcoded story section.
4. Add a second block via admin: it appears with image on the left and the `--process-bg` diagonal gradient background.
5. Add a third block: image on the right again, solid cream background again — confirming ABAB alternation.
6. **Mobile layout check (width < 1024 px)**: resize to 414 × 896 (iPhone-sized). Every block must render title → description → image, top to bottom — even the odd-indexed ones that flip to image-left on desktop. A quick `document.querySelectorAll('[data-testid^=content-block-]')` inspection should show each block's first child contains the `<h2>` (text) and the second child contains the `<img>` (image).
7. Edit the "周爸的故事" description in admin: insert a new line between paragraphs in the Chinese textarea — save — refresh — the new paragraph break renders visually on the homepage (thanks to `whitespace-pre-line`).
8. Toggle the first block's `is_published` off: it disappears; the remaining blocks shift up and their alternation (image side + background) recomputes from their new indices.
9. Switch locale to en: a block without `title_en` still shows the zh title; a block with `title_en` shows English.
10. Delete an image from a block (via admin "移除圖片"): that row collapses to a centered text-only layout.

## Dependencies

- Must complete before: manual E2E.
- Depends on: `backend-api.md`, `shared-types.md`.

## Notes

- No SSR prefetch for now. If SEO becomes a concern for announcement content, add a server-side `prefetch` in the Next.js app router equivalent to how featured products might be prefetched. Not worth the complexity until there's evidence users hit these via search.
- The story block migration is **already done** as part of this ticket: `<StorySection />` is deleted, the row lives at `position = 0` in `content_blocks`, and `<HomeContentBlocks />` handles everything. Index 0 resolves to `imageSide='right'` + `tinted=true`, so the first block visually matches the former hardcoded story.
- The `story.title / story.p1 / story.p2` keys have been removed from `shared/src/i18n/{zh,en}.json` and the corresponding rows dropped from `site_content`. The sync service now reports `122 keys` instead of `125` on startup.
- No changes to `merge-overrides.ts` — content blocks are a separate data source from `site_content`.
