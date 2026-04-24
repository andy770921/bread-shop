# Implementation Plan: Admin Frontend — Feature Flags Page

## Overview

Add a new top-level admin page at `/dashboard/feature-flags`, titled
**功能開關 / Feature Flags**, whose first section is a checkbox group
labeled **首頁顯示類別 / Home-visible Categories**. Ticking / unticking
a box toggles whether the corresponding category appears as a pill on
the customer home page. Saving fires a single `PUT` that replaces the
whole set.

All copy uses the admin i18n system (`useLocale().t(...)`); category
labels inside the checkbox row use `useContentT()` (added in FEAT-6)
so they match what the customer actually sees — overrides included.

## Files to Modify

### New files

- `admin-frontend/src/components/ui/checkbox.tsx` — shadcn-style
  wrapper around Radix Checkbox from the unified `radix-ui` package
  that's already installed.
- `admin-frontend/src/queries/useFeatureFlags.ts` — TanStack hooks
  (`useFeatureFlags`, `useUpdateHomeVisibleCategories`).
- `admin-frontend/src/routes/dashboard/feature-flags/FeatureFlags.tsx`
  — the page.
- `admin-frontend/src/components/feature-flags/HomeVisibleCategoriesSection.tsx`
  — the first section (checkbox group + save button). Splitting lets
  future flag sections live as siblings under the same page.

### Modified files

- `admin-frontend/src/App.tsx`
  - Register the new route under `<Route path="/dashboard">`.
- `admin-frontend/src/components/layout/Sidebar.tsx`
  - Add nav item `{ to: '/dashboard/feature-flags', icon: <icon>,
label: t('nav.featureFlags'), end: false }`.
- `admin-frontend/src/i18n/zh.json`, `admin-frontend/src/i18n/en.json`
  - Add `nav.featureFlags` and a new top-level `featureFlags` block.

## Step-by-Step Implementation

### Step 1: Checkbox primitive

**File:** `admin-frontend/src/components/ui/checkbox.tsx`

```tsx
import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer size-4 shrink-0 rounded-sm border border-border-default bg-bg-elevated transition-colors outline-none',
      'focus-visible:ring-3 focus-visible:ring-ring/50',
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      'data-disabled:cursor-not-allowed data-disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="size-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';
```

**Rationale:** Use `data-[state=checked]` (not the broken
`data-checked` from the Switch fix earlier in this repo) so the
primary color actually applies. `forwardRef` keeps it drop-in for
`react-hook-form` in case we want it elsewhere.

### Step 2: Query hooks

**File:** `admin-frontend/src/queries/useFeatureFlags.ts`

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeatureFlagsResponse, UpdateHomeVisibleCategoriesRequest } from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

export function useFeatureFlags() {
  return useQuery<FeatureFlagsResponse>({
    queryKey: ['api', 'admin', 'feature-flags'],
  });
}

export function useUpdateHomeVisibleCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateHomeVisibleCategoriesRequest) =>
      defaultFetchFn<FeatureFlagsResponse, UpdateHomeVisibleCategoriesRequest>(
        '/api/admin/feature-flags/home-visible-categories',
        { method: 'PUT', body },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api', 'admin', 'feature-flags'] });
      // Invalidate public categories so the admin product form (and any
      // mounted customer view in the same browser tab during QA) refetch.
      qc.invalidateQueries({ queryKey: ['api', 'categories'] });
    },
  });
}
```

**Rationale:** The queryKey `['api','admin','feature-flags']` is
auto-stringified by the shared `stringifyQueryKey` default `queryFn`
into the URL `/api/admin/feature-flags` — matching the pattern already
used by `useAdminSiteContent()` etc.

### Step 3: The section component

**File:** `admin-frontend/src/components/feature-flags/HomeVisibleCategoriesSection.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useCategories } from '@/queries/useAdminProducts';
import { useFeatureFlags, useUpdateHomeVisibleCategories } from '@/queries/useFeatureFlags';
import { useLocale } from '@/hooks/use-locale';
import { useContentT } from '@/hooks/use-content-t';
import { extractErrorMessage } from '@/lib/extract-error-message';

export function HomeVisibleCategoriesSection() {
  const { t } = useLocale();
  const contentT = useContentT();
  const { data: categoriesResp } = useCategories();
  const { data: flags } = useFeatureFlags();
  const update = useUpdateHomeVisibleCategories();

  const categories = useMemo(() => categoriesResp?.categories ?? [], [categoriesResp]);
  const serverIds = useMemo(() => new Set(flags?.homeVisibleCategoryIds ?? []), [flags]);

  // Local state so ticking is instant; reset whenever server data changes.
  const [selected, setSelected] = useState<Set<number>>(serverIds);
  useEffect(() => setSelected(new Set(serverIds)), [serverIds]);

  const dirty = selected.size !== serverIds.size || [...selected].some((id) => !serverIds.has(id));
  const empty = selected.size === 0;

  async function handleSave() {
    try {
      await update.mutateAsync({ category_ids: [...selected] });
      toast.success(t('featureFlags.saved'));
    } catch (err) {
      toast.error(
        `${t('featureFlags.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-serif text-lg font-bold text-text-primary">
            {t('featureFlags.homeCategoriesTitle')}
          </h2>
          <p className="text-sm text-text-secondary">{t('featureFlags.homeCategoriesHelp')}</p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {categories.map((c) => {
            const id = `home-cat-${c.id}`;
            return (
              <Label key={c.id} htmlFor={id} className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  id={id}
                  checked={selected.has(c.id)}
                  onCheckedChange={() => toggle(c.id)}
                />
                <span>{contentT(`category.${c.slug}`)}</span>
              </Label>
            );
          })}
        </div>

        {empty && <p className="text-xs text-error">{t('featureFlags.selectAtLeastOne')}</p>}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || empty || update.isPending}>
            {update.isPending ? t('featureFlags.saving') : t('featureFlags.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Rationale:** Local `selected` set lets the UI feel instant;
`useEffect` keeps it in sync when the server data changes (e.g.,
after save success invalidates + refetches). `dirty` disables save
when nothing changed, `empty` guards the "don't ship an empty set"
invariant in addition to the backend DTO check. Error messages route
through the FIX-4 `extractErrorMessage` helper so future regressions
aren't hidden behind `common.error`.

### Step 4: The page shell

**File:** `admin-frontend/src/routes/dashboard/feature-flags/FeatureFlags.tsx`

```tsx
import { useLocale } from '@/hooks/use-locale';
import { HomeVisibleCategoriesSection } from '@/components/feature-flags/HomeVisibleCategoriesSection';

export default function FeatureFlags() {
  const { t } = useLocale();
  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="font-serif text-lg font-bold text-text-primary md:text-2xl">
        {t('featureFlags.title')}
      </h1>
      <HomeVisibleCategoriesSection />
      {/* Future flag sections drop in here as sibling <Section /> components. */}
    </div>
  );
}
```

**Rationale:** Single-responsibility page shell. Future flags
register by adding one component here — no routing change.

### Step 5: Route + nav

**File:** `admin-frontend/src/App.tsx`

Add import:

```tsx
import FeatureFlags from '@/routes/dashboard/feature-flags/FeatureFlags';
```

Add route child under `<Route path="/dashboard" element={<DashboardLayout />}>`:

```tsx
<Route path="feature-flags" element={<FeatureFlags />} />
```

**File:** `admin-frontend/src/components/layout/Sidebar.tsx`

Add import:

```tsx
import { LayoutDashboard, Package, FileText, ShoppingBag, ToggleRight } from 'lucide-react';
```

Extend `items`:

```tsx
{ to: '/dashboard/feature-flags', icon: ToggleRight, label: t('nav.featureFlags'), end: false },
```

**Rationale:** `ToggleRight` reads as "feature toggle" immediately.
Any other lucide icon (`Flag`, `Sliders`) works; keep the choice if
there's a more conventional one in the broader design system.

### Step 6: i18n strings

**File:** `admin-frontend/src/i18n/zh.json`

Add `nav.featureFlags`:

```json
"nav": {
  "dashboard": "儀表板",
  "products": "商品管理",
  "content": "文案管理",
  "orders": "訂單管理",
  "featureFlags": "功能開關",
  "logout": "登出"
}
```

Add a new top-level `featureFlags` block:

```json
"featureFlags": {
  "title": "功能開關",
  "homeCategoriesTitle": "首頁顯示類別",
  "homeCategoriesHelp": "勾選要出現在首頁類別列的項目；未勾選的類別仍可用於商品歸類，只是不會在首頁顯示。",
  "save": "儲存",
  "saving": "儲存中…",
  "saved": "已儲存",
  "saveFailed": "儲存失敗",
  "selectAtLeastOne": "請至少選擇一個類別"
}
```

**File:** `admin-frontend/src/i18n/en.json`

Add `nav.featureFlags`:

```json
"nav": {
  "dashboard": "Dashboard",
  "products": "Products",
  "content": "Content",
  "orders": "Orders",
  "featureFlags": "Feature Flags",
  "logout": "Logout"
}
```

Add a new top-level `featureFlags` block:

```json
"featureFlags": {
  "title": "Feature Flags",
  "homeCategoriesTitle": "Home-visible Categories",
  "homeCategoriesHelp": "Tick the categories that should appear in the pill rack on the customer home page. Unticked categories still accept product assignments; they just aren't advertised on the home page.",
  "save": "Save",
  "saving": "Saving…",
  "saved": "Saved",
  "saveFailed": "Save failed",
  "selectAtLeastOne": "Select at least one category"
}
```

**Rationale:** Keep the admin-only copy under `featureFlags.*` — it
is **not** customer-facing content, so it should not go through
`useContentT` or `site_content`. Category _labels_ inside the section
still use `useContentT` because those mirror what customers see.

## Testing Steps

1. **Smoke**: start admin dev server, log in as owner, click the new
   sidebar entry. Page renders with every category as a ticked
   checkbox (default state after migration). Save is disabled.
2. **Untick → save**: untick `other`, Save enables, click it,
   observe toast "已儲存 / Saved". Page re-fetches; `other`'s box
   stays unticked.
3. **Zero state**: untick every box; Save disables; the help-red
   copy `請至少選擇一個類別 / Select at least one category` shows.
4. **Locale switch**: toggle zh↔en in admin — page title, section
   heading, help copy, save button all flip; checkbox labels also
   flip because `useContentT` re-derives from the new locale + any
   site_content overrides.
5. **Cross-tab QA**: open customer home in another tab, save a
   change, verify the pill disappears after TanStack's staleTime
   expires (or after a manual reload).
6. **Error surface**: with the backend intentionally returning 400
   (e.g., send empty `category_ids` via curl), confirm the save
   toast prints the real NestJS validation message, not just
   "儲存失敗".

## Dependencies

- Depends on: `backend-api.md` (endpoints and DTO). Without those
  this page will 404 on load.
- Consumed by: no downstream code; customer frontend only needs the
  shared type change and the filter call, which is a separate plan.

## Notes

- **Component placement**: `HomeVisibleCategoriesSection` lives under
  `components/feature-flags/` rather than `components/products/` —
  the page will accumulate non-product flags over time, so the
  grouping belongs to the feature area, not the domain object.
- **Future-flag pattern**: adding flag #2 means (a) new section
  component, (b) new hook in `useFeatureFlags.ts`, (c) extend the
  response shape in `shared/types/feature-flags.ts`. No new route
  or nav item.
- **Why no generic "FlagSection" abstraction**: one flag is not
  enough to spot the right seams. Wait for the second before
  factoring.
