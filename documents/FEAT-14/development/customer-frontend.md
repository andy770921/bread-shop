# Implementation Plan: Customer Frontend

## Overview

Replaces the inline 600 px hero `<section>` in `frontend/src/app/page.tsx` with a new `<HeroCarousel>` component that fetches hero slides from `GET /api/hero-slides` and renders one of three states: **0 slides** (section omitted), **1 slide** (static — visually equivalent to today's hero), **>1 slides** (Embla-backed carousel with prev/next arrows, pagination dots, hover-pause, and a 4 s auto-advance that resets on user interaction). Hero height drops from `h-[600px]` to `h-[400px]` (⅔). The shadcn carousel recipe (Embla + autoplay plugin) is added.

## Files to Modify

### Frontend Changes

- `frontend/src/app/page.tsx` (MODIFY)
  - Replace inline hero `<section>` with `<HeroCarousel />`.
  - Remove the `STORAGE_URL` constant + the `Image` import if no longer used.
- `frontend/src/components/home/hero-carousel.tsx` (NEW)
  - The component itself: branches on slide count, renders static / carousel paths.
- `frontend/src/queries/use-hero-slides.ts` (NEW)
  - TanStack Query hook calling `/api/hero-slides`.
- `frontend/src/components/ui/carousel.tsx` (NEW, shadcn-generated)
  - Result of `npx shadcn@latest add carousel`. Brings in Embla + the prev/next/content/item primitives shadcn ships.
- `frontend/package.json` (MODIFY — via shadcn / npm install)
  - Adds `embla-carousel-react` and `embla-carousel-autoplay`.
- `shared/src/i18n/zh.json` and `shared/src/i18n/en.json` (MODIFY)
  - New `home.carouselPrev`, `home.carouselNext`, `home.carouselSlideOf` keys for ARIA labels.

## Step-by-Step Implementation

### Step 1: Install dependencies

**File:** `frontend/` working dir

**Changes:**
- `cd frontend && npx shadcn@latest add carousel` — generates `src/components/ui/carousel.tsx` and installs `embla-carousel-react`.
- `cd frontend && npm install embla-carousel-autoplay` — autoplay is not pulled in by the shadcn recipe by default.

**Rationale:** shadcn's carousel is the path-of-least-resistance for prev/next + dots + accessibility primitives. Embla is small (~6 KB gz), already battle-tested, and gives us touch swipe for free. The autoplay plugin owns the timer and exposes the `.reset()` we need on user interaction.

### Step 2: Add i18n keys for ARIA + accessibility

**File:** `shared/src/i18n/zh.json`

**Changes:** under the existing `"home": { ... }` block, add:

```json
"carouselPrev": "上一張",
"carouselNext": "下一張",
"carouselSlideOf": "第 {n} 張，共 {total} 張"
```

**File:** `shared/src/i18n/en.json`

**Changes:** mirror in English:

```json
"carouselPrev": "Previous slide",
"carouselNext": "Next slide",
"carouselSlideOf": "Slide {n} of {total}"
```

**Rationale:** Site-content overrides flow through `useSiteContent()` and merge over these JSON defaults — admin can later customise via 文案管理 if needed. Hard-coding ARIA strings would block that escape hatch.

> **Review note (2026-04-28) — `t()` does NOT support placeholder interpolation:** `frontend/src/hooks/use-locale.ts:44–58` defines `t(key: string): string` as a plain dotted-path lookup over `messages`. There is no `{n}` / `{total}` substitution, no second argument, no ICU support. Step 4 below calls `t('home.carouselSlideOf', { n: i + 1, total: slides.length })` and `t('home.carouselSlideOf', { n: index + 1, total: slides.length })` — those second arguments are silently ignored and the user sees the literal string `"第 {n} 張，共 {total} 張"`. Two viable fixes: (a) extend `useLocale().t` to accept a `params?: Record<string, string | number>` and replace `\{(\w+)\}` tokens before returning, OR (b) drop the placeholder approach: store `home.carouselSlideOf` as a label-only string (`"輪播圖位置"`) and build the announcement client-side as `` `${t('home.carouselSlideOf')} ${index + 1} / ${slides.length}` `` (or assemble via locale-aware `Intl.NumberFormat`). Pick (a) and add a regression spec for `t('x', { n: 1 })`. Without one of these the live region announcement and the dot `aria-label` ship with literal `{n}` text.

### Step 3: Create the data hook

**File:** `frontend/src/queries/use-hero-slides.ts`

**Changes:**

```ts
import { useQuery } from '@tanstack/react-query';
import type { HeroSlidesResponse } from '@repo/shared';

export function useHeroSlides() {
  return useQuery<HeroSlidesResponse>({ queryKey: ['api', 'hero-slides'] });
}
```

**Rationale:** The default queryFn at `frontend/src/vendors/tanstack-query/provider.tsx` already maps `['api','hero-slides']` to `GET /api/hero-slides` via `stringifyQueryKey`. No explicit `queryFn` here; one-line hook.

### Step 4: Create `<HeroCarousel>`

**File:** `frontend/src/components/home/hero-carousel.tsx`

**Changes:**

```tsx
'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import Autoplay from 'embla-carousel-autoplay';
import type { HeroSlide } from '@repo/shared';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { useLocale } from '@/hooks/use-locale';
import { useHeroSlides } from '@/queries/use-hero-slides';

const HERO_HEIGHT = 'h-[400px]'; // 2/3 of the previous 600 px

function pickTitle(slide: HeroSlide, locale: string): string {
  if (locale === 'en') return slide.title_en?.trim() ? slide.title_en : slide.title_zh;
  return slide.title_zh;
}
function pickSubtitle(slide: HeroSlide, locale: string): string {
  if (locale === 'en') return slide.subtitle_en?.trim() ? slide.subtitle_en : slide.subtitle_zh;
  return slide.subtitle_zh;
}

function StaticSlide({ slide }: { slide: HeroSlide }) {
  const { locale } = useLocale();
  return (
    <section className={`relative flex ${HERO_HEIGHT} items-center justify-center overflow-hidden`}>
      <Image src={slide.image_url} alt={pickTitle(slide, locale)} fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0" style={{ backgroundColor: 'var(--bg-overlay)' }} />
      <div className="relative z-10 flex flex-col items-center gap-4 px-4 text-center">
        <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
          {pickTitle(slide, locale)}
        </h1>
        <p className="max-w-lg text-lg text-white/90 sm:text-xl">{pickSubtitle(slide, locale)}</p>
      </div>
    </section>
  );
}

function CarouselSlides({ slides }: { slides: HeroSlide[] }) {
  const { locale, t } = useLocale();
  const autoplayRef = useRef(Autoplay({ delay: 4000, stopOnInteraction: false, stopOnMouseEnter: true }));
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    api.on('select', onSelect);
    onSelect();
    return () => { api.off('select', onSelect); };
  }, [api]);

  const reset = useCallback(() => autoplayRef.current.reset(), []);

  return (
    <section className={`relative ${HERO_HEIGHT} overflow-hidden`}>
      <Carousel setApi={setApi} plugins={[autoplayRef.current]} opts={{ loop: true }} className="h-full">
        <CarouselContent className="h-full">
          {slides.map((slide) => (
            <CarouselItem key={slide.id} className="relative h-[400px]">
              <Image src={slide.image_url} alt={pickTitle(slide, locale)} fill priority={slide === slides[0]} sizes="100vw" className="object-cover" />
              <div className="absolute inset-0" style={{ backgroundColor: 'var(--bg-overlay)' }} />
              <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
                <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                  {pickTitle(slide, locale)}
                </h1>
                <p className="max-w-lg text-lg text-white/90 sm:text-xl">{pickSubtitle(slide, locale)}</p>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious aria-label={t('home.carouselPrev')} onClick={reset} />
        <CarouselNext aria-label={t('home.carouselNext')} onClick={reset} />
      </Carousel>

      {/* pagination dots */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={t('home.carouselSlideOf', { n: i + 1, total: slides.length })}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => { api?.scrollTo(i); reset(); }}
            className={`h-2 w-2 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/40 hover:bg-white/70'}`}
          />
        ))}
      </div>

      {/* live region for screen readers */}
      <span className="sr-only" aria-live="polite">
        {t('home.carouselSlideOf', { n: index + 1, total: slides.length })}
      </span>
    </section>
  );
}

export function HeroCarousel() {
  const { data, isLoading } = useHeroSlides();
  const slides = (data?.items ?? []).filter((s) => s.is_published);

  if (isLoading && slides.length === 0) {
    return <section className={`${HERO_HEIGHT} bg-bg-elevated`} aria-hidden="true" />;
  }
  if (slides.length === 0) return null;
  if (slides.length === 1) return <StaticSlide slide={slides[0]} />;
  return <CarouselSlides slides={slides} />;
}
```

**Rationale:**
- Branching at `slides.length === 1` (the user's literal "跟現狀一樣") guarantees no carousel chrome leaks into the single-slide case.
- `priority` is set on the first image only — Next.js complains if multiple slides claim priority; the first slide is what the customer sees on initial paint.
- `loop: true` so the auto-advance never hits a wall.
- Reset on user interaction is wired via the `onClick` of `CarouselPrevious` / `CarouselNext` and the dots, **without** changing the autoplay plugin's `stopOnInteraction` — we want the timer to keep running after a manual nudge, just from zero again.
- Hover pause is handled by `stopOnMouseEnter: true` (Embla resumes on `mouseleave`).
- The fallback skeleton during the very first render is a plain coloured `400 px` box (no spinner) — keeps SSR / hydration smooth without visual flicker.

> **Review note (2026-04-28) — `autoplayRef.current.reset()` plumbing:** the shadcn `Carousel` recipe stashes plugin instances internally and the `setApi` callback only exposes the **Embla API** (`api.scrollNext()` etc.), not the autoplay plugin handle. Calling `autoplayRef.current.reset()` works because `Autoplay({...})` returns the *same* plugin object the ref holds — that part is fine. But the plugin's `.reset()` only restarts the timer **if the plugin is currently playing**; after `stopOnMouseEnter` fires (mouse over) the plugin enters `stopped` state, and `.reset()` will not restart it. Verify against `embla-carousel-autoplay` source: as of v8 the documented behaviour is that `.reset()` no-ops while stopped. If a customer hovers, then clicks "next", the click reset will not restart auto-advance until the cursor leaves. Decide whether this is desired (probably yes — matches the user's "hover pauses" intent) and document the trade-off; otherwise add an explicit `autoplayRef.current.play()` after `.reset()` on click.

> **Review note (2026-04-28) — `CarouselPrevious` / `CarouselNext` `onClick` forwarding:** the shadcn carousel recipe wires its own `onClick` to `api.scrollPrev()` / `scrollNext()`. If the implementer passes `onClick={reset}`, the user's `onClick` may **replace** rather than augment the internal handler depending on shadcn's spread order. Inspect the generated `frontend/src/components/ui/carousel.tsx` after `npx shadcn@latest add carousel`: if `<Button {...props} onClick={...}>` puts `props` *after* the internal `onClick`, the user's `onClick` wins and prev/next stop working. The correct pattern is to use `useEffect` + `api.on('select', ...)` to detect the user-driven scroll and call `reset()` there, OR wrap the buttons in a parent `div` whose `onClickCapture={reset}` fires before the internal handler. The current snippet's behaviour is undefined until the generated file is inspected. Add a verification step.

> **Review note (2026-04-28) — Next.js `<Image>` `remotePatterns`:** `frontend/next.config.ts:8–11` already whitelists `wqgaujuapacxuhvfatii.supabase.co` (the production Supabase host) and `images.unsplash.com`. The seed row's image_url uses that exact host so SSR+`<Image>` is fine on day one. **However** if a future Supabase project ID is provisioned (e.g. a staging branch DB), uploads will land on a different `<projectId>.supabase.co` hostname that is *not* in `remotePatterns` — `<Image>` will throw at runtime. Either widen the pattern to `*.supabase.co` (`hostname: '**.supabase.co'`) or surface this as a known gotcha in the QA checklist. The plan does not mention this constraint.

### Step 5: Update the homepage

**File:** `frontend/src/app/page.tsx`

**Changes:**

- Remove the `STORAGE_URL` constant (line 22–23) — it is no longer referenced.
- Remove the `import Image from 'next/image';` line if no other usage remains in the file (verify with a grep — if any other `<Image>` survives, leave the import).
- Add `import { HeroCarousel } from '@/components/home/hero-carousel';` at the top of the imports block.
- Replace lines 47–64 (the entire `{/* Hero Section */} <section> ... </section>` block) with `<HeroCarousel />`.

The diff in the JSX:

```diff
       <Header />
       <SeasonalBanner />
-
-      {/* Hero Section */}
-      <section className="relative flex h-[600px] items-center justify-center overflow-hidden">
-        <Image
-          src={`${STORAGE_URL}hero-bakery.jpg`}
-          alt="Papa Bakery Hero"
-          fill
-          priority
-          sizes="100vw"
-          className="object-cover"
-        />
-        <div className="absolute inset-0" style={{ backgroundColor: 'var(--bg-overlay)' }} />
-        <div className="relative z-10 flex flex-col items-center gap-4 px-4 text-center">
-          <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
-            {t('home.title')}
-          </h1>
-          <p className="max-w-lg text-lg text-white/90 sm:text-xl">{t('home.subtitle')}</p>
-        </div>
-      </section>
+      <HeroCarousel />
```

**Rationale:** All hero rendering is now inside the new component. The page-level `useLocale()` is still needed because `<ProductGrid>` consumes `locale`, so don't remove it. `t('home.title')` calls in `Header` and `Footer` are not affected.

### Step 6: Verify TanStack Query default queryFn handles the new key

**File:** `frontend/src/vendors/tanstack-query/provider.tsx` (verify only — no edit expected)

**Changes:**
- Confirm the default queryFn maps `['api', 'hero-slides']` to `/api/hero-slides`. Per CLAUDE.md, this is auto-generated by `stringifyQueryKey`. No change needed.

**Rationale:** Catches the case where someone has overridden the default queryFn locally and unaware of the contract.

## Testing Steps

1. **Unit — `hero-carousel.spec.tsx`**
   - Render with `useHeroSlides` mocked to return `{ items: [] }` → component renders nothing (empty DOM).
   - Render with `{ items: [oneSlide] }` → no `[aria-label="Previous slide"]` button; the title text is rendered.
   - Render with `{ items: [s1, s2, s3] }` → prev / next buttons present, three pagination dots present, first slide active.
   - Click "next" → advance the active dot. Spy on the autoplay plugin's `reset` to confirm it was called.
   - Mock timers: advance 4 s → active slide changes from 0 to 1 without any interaction.
2. **Type-check** — `cd frontend && npx tsc --noEmit` passes.
3. **Manual desktop** — `npm run dev` → `http://localhost:3001` → verify:
   - The hero is visibly shorter than before (400 px vs 600 px). Use devtools to confirm the computed height.
   - With one seeded slide present, the hero looks identical to the pre-FEAT-14 version (no arrows, no dots, no rotation).
   - Add a second slide via `/dashboard/content-blocks` → refresh `/` → arrows + dots appear, slide auto-advances every 4 s.
   - Hover the carousel → rotation pauses; move the cursor away → resumes.
   - Click "next" while a slide is mid-cycle → new slide appears and stays for a full 4 s before advancing.
4. **Manual mobile** — Chrome devtools mobile emulator → swipe left / right works, advance + reset behaves the same.
5. **Manual locale switch** — toggle to EN; verify the EN title / subtitle render. Save a slide with `title_en` empty → confirm the FE falls back to `title_zh`.
6. **Empty-list smoke** — in admin, delete every published slide. Refresh `/`. The hero section disappears entirely; the seasonal banner sits directly above the products grid.

## Dependencies

- **Depends on:** `database-schema.md`, `backend-api.md` (the `GET /api/hero-slides` endpoint must respond before the FE can render anything).
- **Must complete before:** customer-frontend QA at `documents/FEAT-14/development/qa-checklist.md` (if added).

## Notes

- The `bg-overlay` CSS variable + `font-heading` Tailwind utility are already defined in `globals.css`; reused as-is.
- Don't overthink the dot styling — 8 px circles, `bg-white` for active, `bg-white/40` for idle, mirrors the most common shadcn carousel demo. Brand polish can be a follow-up.
- If shadcn's `Carousel` primitives don't already accept an `onClick` on `CarouselPrevious` / `CarouselNext`, wrap the buttons in a thin component that forwards the click. The shadcn recipe forwards via `...props`, so no wrapper is expected — verify against the generated file.
- `stopOnInteraction: false` is critical. The user explicitly asked for "當使用者沒有刻意按箭頭時，每 4 秒播一張" — meaning rotation should continue after a click, just with the timer reset. `stopOnInteraction: true` would freeze the carousel after the first click.
- The `priority` flag is **only** on the first slide's `<Image>` to avoid Next.js's runtime warning. Subsequent slides preload via Embla as the user navigates.
- Layout reservation: the static path uses `<section className={HERO_HEIGHT}>`, the loading skeleton uses the same `HERO_HEIGHT`, and the carousel path also uses `HERO_HEIGHT` on its outermost `<section>`. This guarantees the products grid below never jumps as the slides hydrate.

> **Review note (2026-04-28) — `'use client'` already on `page.tsx`:** the existing `frontend/src/app/page.tsx:1` has `'use client'`, so the new `<HeroCarousel />` (also a client component) hydrates with the rest of the page. **However** SSR will execute the client component's first render: `useHeroSlides()` returns `{ data: undefined, isLoading: true }` on the server (TanStack Query default), so the SSR markup contains the loading-skeleton `<section className="h-[400px] bg-bg-elevated" aria-hidden="true">` — **not** the hero. After hydration the query refetches and the actual hero replaces the skeleton. This is fine but means **first-paint LCP is the skeleton, not the hero image**, even with the seed row in place. To avoid the LCP regression on the first slide, consider prefetching `/api/hero-slides` server-side via a Next.js Server Component wrapper, OR include the seed slide's data inline (less elegant). At minimum, document the LCP behaviour change in the QA section so the manual smoke compares against the pre-FEAT-14 baseline knowing the SSR markup differs.

> **Review note (2026-04-28) — `data?.items` is filtered twice:** `useHeroSlides` returns the raw `HeroSlidesResponse` which already contains `is_published = true` rows only (per `HeroSlidesService.listPublished`). The component's `slides = (data?.items ?? []).filter((s) => s.is_published)` line is therefore redundant but harmless. Decide whether to drop the FE filter (fewer code lines, trusts BE) or keep as defence-in-depth (the admin endpoint reuses `HeroSlide` shape and a developer might one day repoint the hook). Either way, mention the choice; the current code is silently coupled to a BE invariant that is not documented at the call site.
