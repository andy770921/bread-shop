# Implementation Plan: Hero Slide Title/Subtitle Size Customization

## Overview

Extends the FEAT-14 hero slide schema so each slide carries its own title and subtitle size. The admin form gains two `<Select>` controls (one per text field) offering five preset sizes; the customer `<HeroCarousel>` applies the saved size at render time. Size is stored as a short string enum (`xs | sm | md | lg | xl`), not as raw Tailwind classes — the FE owns the class mapping so future redesigns don't require a DB migration.

## Sizes

Five named presets per text field. `md` is the default and reproduces today's FEAT-14 hero (so existing rows + new rows that don't override the size look identical to the current shipped hero).

| Preset | Title classes (mobile / sm / lg)                | Subtitle classes (mobile / sm)         |
| ------ | ----------------------------------------------- | -------------------------------------- |
| `xs`   | `text-2xl sm:text-3xl lg:text-4xl`              | `text-sm sm:text-base`                 |
| `sm`   | `text-3xl sm:text-4xl lg:text-5xl`              | `text-base sm:text-lg`                 |
| `md`   | `text-4xl sm:text-5xl lg:text-6xl` *(default)*  | `text-lg sm:text-xl` *(default)*       |
| `lg`   | `text-5xl sm:text-6xl lg:text-7xl`              | `text-xl sm:text-2xl`                  |
| `xl`   | `text-6xl sm:text-7xl lg:text-8xl`              | `text-2xl sm:text-3xl`                 |

Rationale for storing the preset name (not the raw classes):
- Admins pick a meaning, not Tailwind tokens.
- A future visual redesign that swaps `text-4xl` for `text-[2.5rem]` only edits the FE map.
- The class strings are kept as **string literals** in the FE source so Tailwind's content scanner picks them up.

## Files to Modify

### Database (Supabase MCP)

- `public.hero_slides` — add `title_size` + `subtitle_size` text columns with CHECK constraint and `'md'` default.

### Shared Types

- `shared/src/types/hero-slide.ts` — add `HeroSlideTextSize` union, add the two fields to `HeroSlide` / `CreateHeroSlideRequest` / (`UpdateHeroSlideRequest` is `Partial<…>` so it picks them up automatically).

### Backend

- `backend/src/admin/dto/upsert-hero-slide.dto.ts` — two new optional fields validated with `@IsIn(['xs','sm','md','lg','xl'])`.
- `backend/src/admin/hero-slides-admin.service.ts` — pass through the two fields on create/update.

### Customer Frontend

- `frontend/src/components/home/hero-carousel.tsx` — add the two class maps as module-level `const` objects; resolve via the slide's `title_size` / `subtitle_size` (fall back to `md`); apply on both the static-single path and the carousel path.

### Admin Frontend

- `admin-frontend/src/routes/dashboard/content-blocks/HeroSlideForm.tsx` — add two `<Select>` controls bound through `Controller`; default `md` on create.
- `admin-frontend/src/i18n/zh.json` and `en.json` — add labels for the two field names + the five size presets.

## Step-by-Step Implementation

### Step 1: Database migration

**Tool:** `mcp__plugin_supabase_supabase__apply_migration` (no checked-in SQL file, matching the FEAT-14 pattern).

```sql
ALTER TABLE public.hero_slides
  ADD COLUMN title_size text NOT NULL DEFAULT 'md',
  ADD COLUMN subtitle_size text NOT NULL DEFAULT 'md';

ALTER TABLE public.hero_slides
  ADD CONSTRAINT hero_slides_title_size_check
    CHECK (title_size IN ('xs', 'sm', 'md', 'lg', 'xl')),
  ADD CONSTRAINT hero_slides_subtitle_size_check
    CHECK (subtitle_size IN ('xs', 'sm', 'md', 'lg', 'xl'));
```

**Rationale:**
- `NOT NULL DEFAULT 'md'` keeps the existing seed row visually identical to today's hero (no backfill needed; PostgreSQL backfills the default during the ADD COLUMN).
- `CHECK` constraints enforce the enum at the data layer so a misbehaving client cannot insert `'huge'`. The application also validates via `class-validator` (`@IsIn`), but defence-in-depth is cheap here.
- Stored as `text`, not as a PG enum type — adding a sixth size in the future is a CHECK constraint swap, not a `CREATE TYPE … RENAME` migration.

### Step 2: Shared types

**File:** `shared/src/types/hero-slide.ts`

```ts
export type HeroSlideTextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const HERO_SLIDE_TEXT_SIZES: readonly HeroSlideTextSize[] = [
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
] as const;

export interface HeroSlide {
  id: string;
  title_zh: string;
  title_en: string | null;
  subtitle_zh: string;
  subtitle_en: string | null;
  image_url: string;
  position: number;
  is_published: boolean;
  title_size: HeroSlideTextSize;
  subtitle_size: HeroSlideTextSize;
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
  title_size?: HeroSlideTextSize;
  subtitle_size?: HeroSlideTextSize;
}

export type UpdateHeroSlideRequest = Partial<CreateHeroSlideRequest>;
```

`HERO_SLIDE_TEXT_SIZES` is exported so the admin `<Select>` and the backend DTO's `@IsIn` decorator share a single source of truth.

### Step 3: Backend DTO

**File:** `backend/src/admin/dto/upsert-hero-slide.dto.ts`

Add the two fields as optional with `@IsIn`:

```ts
import { IsIn } from 'class-validator';
import { HERO_SLIDE_TEXT_SIZES, type HeroSlideTextSize } from '@repo/shared';

// inside the class, alongside the existing fields:
@ApiPropertyOptional({ enum: HERO_SLIDE_TEXT_SIZES })
@IsOptional()
@IsString()
@IsIn(HERO_SLIDE_TEXT_SIZES as unknown as string[])
title_size?: HeroSlideTextSize;

@ApiPropertyOptional({ enum: HERO_SLIDE_TEXT_SIZES })
@IsOptional()
@IsString()
@IsIn(HERO_SLIDE_TEXT_SIZES as unknown as string[])
subtitle_size?: HeroSlideTextSize;
```

Keeping every field `@IsOptional()` matches the existing PATCH-with-partial-body pattern (see the FEAT-14 review note). Required-ness on create is enforced inside the service, but for sizes the DB default already covers create-without-specifying.

### Step 4: Backend service

**File:** `backend/src/admin/hero-slides-admin.service.ts`

In `create`, append size fields to the insert payload (both have a server-side default, so omitting them is fine):

```ts
const payload = {
  title_zh: dto.title_zh.trim(),
  title_en: normalizeNullable(dto.title_en) ?? null,
  subtitle_zh: dto.subtitle_zh,
  subtitle_en: normalizeNullable(dto.subtitle_en) ?? null,
  image_url: dto.image_url.trim(),
  is_published: dto.is_published ?? true,
  position: nextPosition,
  ...(dto.title_size !== undefined ? { title_size: dto.title_size } : {}),
  ...(dto.subtitle_size !== undefined ? { subtitle_size: dto.subtitle_size } : {}),
};
```

In `update`, mirror the existing field-by-field copy:

```ts
if (dto.title_size !== undefined) payload.title_size = dto.title_size;
if (dto.subtitle_size !== undefined) payload.subtitle_size = dto.subtitle_size;
```

The `select('*')` in the existing list/get/create/update queries already returns the new columns; no SQL changes there.

### Step 5: Customer frontend rendering

**File:** `frontend/src/components/home/hero-carousel.tsx`

Add module-level maps and a resolver, then apply the resolved class string on both render paths:

```ts
import type { HeroSlide, HeroSlideTextSize } from '@repo/shared';

const TITLE_SIZE_CLASSES: Record<HeroSlideTextSize, string> = {
  xs: 'text-2xl sm:text-3xl lg:text-4xl',
  sm: 'text-3xl sm:text-4xl lg:text-5xl',
  md: 'text-4xl sm:text-5xl lg:text-6xl',
  lg: 'text-5xl sm:text-6xl lg:text-7xl',
  xl: 'text-6xl sm:text-7xl lg:text-8xl',
};

const SUBTITLE_SIZE_CLASSES: Record<HeroSlideTextSize, string> = {
  xs: 'text-sm sm:text-base',
  sm: 'text-base sm:text-lg',
  md: 'text-lg sm:text-xl',
  lg: 'text-xl sm:text-2xl',
  xl: 'text-2xl sm:text-3xl',
};

function titleSize(slide: HeroSlide): string {
  return TITLE_SIZE_CLASSES[slide.title_size] ?? TITLE_SIZE_CLASSES.md;
}
function subtitleSize(slide: HeroSlide): string {
  return SUBTITLE_SIZE_CLASSES[slide.subtitle_size] ?? SUBTITLE_SIZE_CLASSES.md;
}
```

Use them in the `<h1>` and `<p>` of both `StaticSlide` and `CarouselSlides`:

```tsx
<h1 className={`font-heading font-bold text-white ${titleSize(slide)}`}>
  {pickTitle(slide, locale)}
</h1>
<p className={`max-w-lg text-white/90 ${subtitleSize(slide)}`}>
  {pickSubtitle(slide, locale)}
</p>
```

The `??` fallback covers the case where a future migration drops the column or returns `undefined` during loading — never crash on a missing size.

### Step 6: Admin form

**File:** `admin-frontend/src/routes/dashboard/content-blocks/HeroSlideForm.tsx`

1. Update the Zod schema:

   ```ts
   import { HERO_SLIDE_TEXT_SIZES } from '@repo/shared';

   const sizeEnum = z.enum(HERO_SLIDE_TEXT_SIZES as unknown as [string, ...string[]]);

   const schema = z.object({
     // ...existing fields
     title_size: sizeEnum,
     subtitle_size: sizeEnum,
   });
   ```

2. Update `defaultValues` to include `title_size: 'md', subtitle_size: 'md'`.
3. In the `useEffect` that resets when `initial` changes, copy `initial.title_size` and `initial.subtitle_size` (fallback to `'md'` if the row predates this migration — defensive only; the DB has a default so this should not happen in practice).
4. Render two `<Select>` controls bound via `Controller`. Place them in a 2-column grid below the subtitle row, before the image upload:

   ```tsx
   <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
     <Field label={t('heroSlides.titleSize')}>
       <Controller
         name="title_size"
         control={control}
         render={({ field }) => (
           <Select value={field.value} onValueChange={field.onChange}>
             <SelectTrigger><SelectValue /></SelectTrigger>
             <SelectContent>
               {HERO_SLIDE_TEXT_SIZES.map((s) => (
                 <SelectItem key={s} value={s}>{t(`heroSlides.size.${s}`)}</SelectItem>
               ))}
             </SelectContent>
           </Select>
         )}
       />
     </Field>
     <Field label={t('heroSlides.subtitleSize')}>
       {/* mirror */}
     </Field>
   </div>
   ```

5. Update the parent `HeroSlidesPanel.handleSubmit` to forward `title_size` / `subtitle_size` in the body sent to `useCreateHeroSlide` / `useUpdateHeroSlide`.

### Step 7: i18n

**File:** `admin-frontend/src/i18n/zh.json` (under `heroSlides`)

```json
"titleSize": "標題大小",
"subtitleSize": "副標大小",
"size": {
  "xs": "極小",
  "sm": "小",
  "md": "中",
  "lg": "大",
  "xl": "極大"
}
```

**File:** `admin-frontend/src/i18n/en.json` (under `heroSlides`)

```json
"titleSize": "Title size",
"subtitleSize": "Subtitle size",
"size": {
  "xs": "Extra small",
  "sm": "Small",
  "md": "Medium",
  "lg": "Large",
  "xl": "Extra large"
}
```

`md` is the default — admins do not need to choose a size unless they want to deviate.

## Testing Steps

1. **Migration** — `mcp__plugin_supabase_supabase__execute_sql` with `SELECT id, title_size, subtitle_size FROM public.hero_slides;` returns existing rows with `'md'` for both columns.
2. **Type-check** — `npm run build` from root succeeds (shared types compile, both frontends and backend pick them up).
3. **Lint** — `npm run lint` passes; no ESLint complaints about the new class-string maps.
4. **Tests** — `npm run test` passes (no new specs introduced — matches the existing FEAT-14 module convention of zero spec coverage).
5. **Backend smoke** — `curl -X PATCH http://localhost:3000/api/admin/hero-slides/<id> -H "Authorization: Bearer <admin>" -d '{"title_size":"lg"}'` returns 200 with `title_size: "lg"`. With an invalid value (`"huge"`) returns 400.
6. **Customer FE smoke** — open `/`; with the seed row's `title_size = 'md'`, the hero looks identical to before. Update the seed row to `title_size = 'xl'` via the admin UI, refresh `/`, confirm the title visibly grows.
7. **Admin FE smoke** — open `/dashboard/content-blocks` → 首頁輪播圖 tab → create slide; the two new size selects default to `中` / `Medium`; switching to `極大` and saving persists; reopening the row shows the saved selection.
8. **Cross-locale check** — toggle admin to EN; size labels read `Extra small … Extra large`; submit still works.

## Out of Scope

- Per-slide text **colour** customisation. v1 keeps the existing `text-white` on title and `text-white/90` on subtitle.
- Per-slide **font weight** / **letter spacing** / **alignment** customisation. The current `font-heading font-bold` and centre alignment apply uniformly.
- Free-form pixel size input. Five presets give predictable visual rhythm; arbitrary `font-size: 73px` invites layout collisions on mobile.
- Localised default sizes (e.g. EN slides defaulting to `lg` because Latin glyphs are narrower). One default for both locales — admins override per slide if needed.
- Storing the actual Tailwind class strings in the DB. Keeping the FE as the single source of class truth means a future redesign does not need a data migration.
- Backfilling existing `content_blocks` rows with the same feature. This change is hero-slide-specific. Bottom blocks are unchanged.

## Notes

- **Tailwind safelist:** all 10 size class strings (5 title + 5 subtitle) appear as **literal** values inside the customer FE map. Tailwind v4's content scanner picks them up automatically; no `safelist` config edit is required. Do not refactor the map to compute classes from a base size — that would defeat the scanner.
- **Default propagation:** the migration uses `DEFAULT 'md'`, so a `POST /api/admin/hero-slides` body that omits the size fields lands a row with both set to `md`. The admin form's `defaultValues` likewise default to `md`. The customer FE's resolver also falls back to `md` when the field is missing. Three layers of defence — pick the lowest layer that matches reality.
- **Naming:** the preset names (`xs`/`sm`/`md`/`lg`/`xl`) intentionally mirror Tailwind's spacing scale to feel familiar to the dev team. The user-facing labels (`極小`/`Extra small` …) are localised via i18n and are decoupled from the storage value.
- **Migration ordering on production:** apply the migration first (additive, defaults backfill, zero downtime), then deploy the backend (DTO accepts new fields), then the FEs (admin form exposes selects; customer FE applies classes). All three steps are safe in isolation: an old FE talking to a migrated DB simply doesn't see the new columns; a new FE talking to a pre-migration DB receives `undefined` for the size fields and falls back to `md`.
