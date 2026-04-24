# FEAT-6: Localize Category Labels in Admin Backoffice

## Problem

In the admin product edit page and product list, the category dropdown
and category column displayed raw slugs — `toast`, `cake`, `cookie`,
`bread`, `other`. Meanwhile the customer frontend has always rendered
localized labels (`吐司` / `Toast`, `其他` / `Other`, …) and respected
`site_content` overrides from the admin content editor. So an admin
user who had renamed `category.other` to `公告` / `Notice` would see
the rename on the customer site but continue to see `other` in their
own product form.

The ask: make the admin's category display match what the customer
sees, *including* any `site_content` overrides the admin has applied.

## Research

### Where the customer labels come from

The customer frontend's `useLocale().t()` resolves a key by:

1. Taking `defaultContent[locale]` (exported from `@repo/shared`, backed
   by `shared/src/i18n/{zh,en}.json`).
2. Layering on top any matching entries from
   `GET /api/site-content` (handled by `useSiteContent()` +
   `mergeOverrides()` in `frontend/src/i18n/merge-overrides.ts`).

So for `category.other` with locale `zh`:

- Default is `其他` from `shared/src/i18n/zh.json`.
- If the admin has saved an override `{ key: 'category.other',
  value_zh: '公告', value_en: 'Notice' }` via the content editor, the
  customer sees `公告`.

### What the admin already has in place

All four ingredients for mirroring this in admin already exist:

- `@repo/shared` exports `defaultContent` and the `NestedRecord` type
  (`shared/src/i18n/defaults.ts`).
- `admin-frontend/src/queries/useSiteContent.ts` already defines
  `useAdminSiteContent()` hitting `GET /api/admin/site-content`, which
  returns `SiteContentResponse = { overrides: SiteContentEntry[] }`
  (same shape as the customer endpoint, just admin-auth'd).
- `admin-frontend/src/hooks/use-locale.ts` exposes the admin's chosen
  `locale` (stored under `localStorage` key `admin_locale`).
- The admin's own `t()` already coexists with customer content — it
  resolves *admin UI* strings (商品管理 / 儲存中…) from
  `admin-frontend/src/i18n/{zh,en}.json`. Category labels are not in
  that set, so there's no collision with a new customer-content `t`.

### What was missing

A single small hook that combines those four to replicate the
customer's content lookup in the admin context. Nothing else — no new
endpoint, no schema change, no new i18n files.

### Rejected alternatives

- **Duplicate category labels into
  `admin-frontend/src/i18n/{zh,en}.json`.** Would drift from the
  customer copy, and would ignore the admin's own `site_content`
  overrides. Rejected.
- **Ship category display names in the `categories` table.** Would
  require a backend schema change and migration just to move a value
  that already lives in `site_content`. Rejected.
- **Lift `mergeOverrides` from `frontend` up to `@repo/shared` and
  reuse it here.** Plausible, but the whole merge step is a
  15-line-map-lookup when the only consumer cares about one key at a
  time. Inlining it in the new hook kept the blast radius to one file.

### Trade-offs accepted

- On first load of any page using the new hook, the site_content query
  is `undefined` for a tick, so the dropdown shows the *default*
  label (e.g. 其他) before settling into the *override* (e.g. 公告).
  TanStack Query caches for 5 min, so this only happens on a cold
  load.
- Admins who mentally index categories by English slug (`toast`,
  `bread`, …) lose that crutch. Mitigation: the admin's
  locale toggle keeps zh / en in sync, so switching to en still shows
  the user-recognizable English labels.
- The admin still fetches `/api/admin/site-content` on pages that
  previously didn't need it (product list, product edit). In practice
  the admin already visits the content editor regularly, so the query
  is usually already warm.

## Changes

### New file — `admin-frontend/src/hooks/use-content-t.ts`

```ts
import { useCallback, useMemo } from 'react';
import { defaultContent, type NestedRecord } from '@repo/shared';
import { useLocale } from '@/hooks/use-locale';
import { useAdminSiteContent } from '@/queries/useSiteContent';

/**
 * Localize a *customer-facing* content key (e.g. `category.toast`,
 * `badge.hot`) the same way the customer frontend does: `defaultContent`
 * from `@repo/shared` as the baseline, with `site_content` overrides
 * layered on top.
 *
 * Distinct from `useLocale().t`, which resolves admin-UI strings only
 * (e.g. 商品管理 / 儲存中…) from `admin-frontend/src/i18n/{zh,en}.json`.
 */
export function useContentT() {
  const { locale } = useLocale();
  const { data } = useAdminSiteContent();

  const overrideLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of data?.overrides ?? []) {
      const val = locale === 'zh' ? o.value_zh : o.value_en;
      if (val != null && val !== '') map.set(o.key, val);
    }
    return map;
  }, [locale, data]);

  return useCallback(
    (key: string): string => {
      const override = overrideLookup.get(key);
      if (override) return override;

      const parts = key.split('.');
      let current: unknown = defaultContent[locale];
      for (const p of parts) {
        if (current && typeof current === 'object') {
          current = (current as NestedRecord)[p];
        } else {
          return key;
        }
      }
      return typeof current === 'string' ? current : key;
    },
    [locale, overrideLookup],
  );
}
```

Design notes:

- `overrideLookup` is a `Map`, not `Array.find`, so each lookup is
  O(1) regardless of how many `site_content` rows the admin has
  accumulated.
- The `useMemo` dep is `data` (the TanStack query result), not
  `data.overrides`. TanStack Query returns structurally-shared data
  so identity is stable across refetches that don't change payload.
- On a missing key the hook returns the key itself (`category.other`),
  matching the customer's `useLocale().t()` behavior.

### `admin-frontend/src/components/products/ProductForm.tsx`

Category `SelectItem` was rendering the raw slug; now it renders the
localized label.

#### Before

```tsx
import { ImageUploader } from './ImageUploader';
import { useCategories } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';

// …

export function ProductForm({ initial, onSubmit, submitting, productId }: Props) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { data: categories } = useCategories();

  // …

  {categories?.categories.map((c) => (
    <SelectItem key={c.id} value={String(c.id)}>
      {c.slug}
    </SelectItem>
  ))}
```

#### After

```tsx
import { ImageUploader } from './ImageUploader';
import { useCategories } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';
import { useContentT } from '@/hooks/use-content-t';

// …

export function ProductForm({ initial, onSubmit, submitting, productId }: Props) {
  const { t } = useLocale();
  const contentT = useContentT();
  const navigate = useNavigate();
  const { data: categories } = useCategories();

  // …

  {categories?.categories.map((c) => (
    <SelectItem key={c.id} value={String(c.id)}>
      {contentT(`category.${c.slug}`)}
    </SelectItem>
  ))}
```

Because Radix Select renders the selected item's children inside
`SelectValue`, changing the `SelectItem`'s text is sufficient — the
selected-state display (when a category is already picked on edit)
picks up the new label automatically.

### `admin-frontend/src/routes/dashboard/products/ProductList.tsx`

The product list renders the category label in two places (desktop
table and mobile card). Both switched to `useContentT`.

#### Before

```tsx
import { useAdminProducts, useDeleteProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';

export default function ProductList() {
  const { t } = useLocale();
  const { data, isLoading } = useAdminProducts();
  const del = useDeleteProduct();

  // …

  <TableCell className="text-text-secondary">{p.category?.slug}</TableCell>

  // …

  <span className="truncate">{p.category?.slug ?? '—'}</span>
```

#### After

```tsx
import { useAdminProducts, useDeleteProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';
import { useContentT } from '@/hooks/use-content-t';

export default function ProductList() {
  const { t } = useLocale();
  const contentT = useContentT();
  const { data, isLoading } = useAdminProducts();
  const del = useDeleteProduct();

  // …

  <TableCell className="text-text-secondary">
    {p.category ? contentT(`category.${p.category.slug}`) : ''}
  </TableCell>

  // …

  <span className="truncate">
    {p.category ? contentT(`category.${p.category.slug}`) : '—'}
  </span>
```

The `? : ''` / `? : '—'` guards preserve the previous empty/placeholder
behavior when a product row has a missing category.

## Unchanged by design

- `backend/`: no DTO, route, or schema changes. Category data is
  still `(id, slug, sort_order)` as stored in Postgres.
- `frontend/`: no changes. The customer already used the content
  pipeline.
- `categories` table: untouched. The localized label lives in
  `shared/src/i18n/{zh,en}.json` (default) and `site_content` table
  (override), both already used by the customer site.
- Admin's `useLocale().t()`: still scoped to admin UI strings
  (商品管理, 儲存中…). Categories are not part of that set, so the new
  `useContentT` sits alongside it cleanly.

## Build / Lint

```
npm run build -w admin-frontend   # tsc -b && vite build — clean
npm run lint  -w admin-frontend   # eslint — clean
```

## Verification Checklist

- Edit an existing product. The category dropdown trigger displays the
  localized label (e.g. `吐司` rather than `toast`) immediately once
  `site_content` resolves.
- In the content editor, rename `category.other` to `公告` / `Notice`.
  Navigate back to a product whose category is `other`. Admin
  dropdown and list cell now show `公告` / `Notice`, matching the
  customer storefront.
- Toggle admin locale from `zh` to `en`. Labels update in place.
- On a cold cache, the first render may momentarily show the default
  (`其他`) before the override (`公告`) wins. This is expected.
