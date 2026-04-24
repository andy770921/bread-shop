# Implementation Plan: Customer Frontend Display

## Overview

Add a `<HomeContentBlocks />` React Server/Client component that fetches published content blocks and renders them stacked below the existing `<StorySection />`. Each block uses the same responsive 2-column layout as the story section, with image side alternating by index for visual rhythm. Handles image-less blocks and an empty list gracefully.

## Files to Modify

### Frontend Changes

- `frontend/src/components/home/home-content-blocks.tsx` — NEW
- `frontend/src/queries/use-content-blocks.ts` — NEW
- `frontend/src/app/page.tsx` — render `<HomeContentBlocks />` directly below `<StorySection />`.
- `frontend/src/components/home/home-content-blocks.spec.tsx` — NEW (Jest + RTL).

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
        />
      ))}
    </>
  );
}

function ContentBlockRow({
  block, locale, imageSide,
}: {
  block: ContentBlock;
  locale: 'zh' | 'en';
  imageSide: 'left' | 'right';
}) {
  const title = locale === 'en' && block.title_en ? block.title_en : block.title_zh;
  const description =
    locale === 'en' && block.description_en ? block.description_en : block.description_zh;
  const hasImage = !!block.image_url;

  return (
    <section
      className="py-16 lg:py-24"
      style={{ backgroundColor: 'var(--primary-50)' }}
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
            className={
              hasImage
                ? imageSide === 'right'
                  ? 'order-1'
                  : 'order-2'
                : undefined
            }
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
                imageSide === 'right' ? 'order-2' : 'order-1'
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

- Matches the existing `StorySection` layout classes (`py-16 lg:py-24`, `grid grid-cols-1 lg:grid-cols-2`, `h-[360px] lg:h-[460px]`, `object-cover`) so stacked blocks look like siblings of the story, not a foreign element.
- `whitespace-pre-line` preserves paragraph breaks typed into the admin textarea without needing Markdown.
- Image side is derived from `index` — no DB column. Even indices (including block 0 right after the story) put the image on the right, same as the story section, so the first content block visually mirrors the story's composition rather than flipping. Odd indices flip for variety.
- No-image fallback centers the text in a `max-w-3xl` column — good for pure announcements / shipping info.
- `aria-labelledby` + per-block heading id keeps the section structure accessible when multiple blocks stack.

### Step 3: Render on the homepage

**File:** `frontend/src/app/page.tsx`

**Change:**

```tsx
import { HomeContentBlocks } from '@/components/home/home-content-blocks';
// ...
<StorySection />
<HomeContentBlocks />
<Footer />
```

**Rationale:** Keeps the existing ordering — Hero → Categories → Featured Products → Process → Story → ContentBlocks → Footer — mirroring the screenshot the user provided ("往下加長內容" under the story section).

### Step 4: Jest test

**File:** `frontend/src/components/home/home-content-blocks.spec.tsx`

Cover:

1. Returns null when `items` is empty.
2. Renders one `<section>` per item.
3. Under `locale=en`, falls back to `title_zh` when `title_en` is null.
4. Block without `image_url` does not render an `<img>`.
5. Image side alternates: index 0 → order-1 for text (right image), index 1 → order-2 for text (left image).

**Rationale:** These are the rules most likely to regress during future refactors; covering them with RTL makes the behavior explicit.

## Testing Steps

1. `cd backend && npm run start:dev` + `cd frontend && npm run dev`.
2. With zero content blocks: homepage renders story section followed by the footer — no empty gap.
3. Add one block via admin: homepage re-fetches within 60s (or hard-refresh) and shows the block with image on the right.
4. Add a second block: image appears on the left.
5. Toggle the first block's `is_published` off in admin: it disappears from the homepage.
6. Switch locale to en; a block without `title_en` still shows the zh title; a block with `title_en` shows English.
7. Delete an image from a block (via admin "移除圖片"): that row collapses to a centered text-only layout.

## Dependencies

- Must complete before: manual E2E.
- Depends on: `backend-api.md`, `shared-types.md`.

## Notes

- No SSR prefetch for now. If SEO becomes a concern for announcement content, add a server-side `prefetch` in the Next.js app router equivalent to how featured products might be prefetched. Not worth the complexity until there's evidence users hit these via search.
- When the story block is eventually migrated into `content_blocks` (separate ticket), the existing `<StorySection />` is deleted and `<HomeContentBlocks />` handles everything — the alternation logic will seamlessly take over since position 0 (the former story) will render on the right just like today.
- No changes to `merge-overrides.ts` or `site_content` — content blocks are a separate data source.
