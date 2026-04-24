# Implementation Plan: Customer Frontend — Home Pill Filter

## Overview

Once `Category.visible_on_home` ships, the customer home page should
skip pills whose flag is `false`. The change is one filter added in
the pill component. The shared `Category` type update means every
other site use of `useCategories()` also exposes the field, but no
consumer other than `CategoryPills` should react to it.

## Files to Modify

- `frontend/src/components/product/category-pills.tsx`
  - Filter the incoming `categories` array by `visible_on_home`
    before rendering.

That is the only customer-side code change required. The shared type
bump (see `backend-api.md` step 2) handles TS propagation.

## Step-by-Step Implementation

### Step 1: Filter in the pill component

**File:** `frontend/src/components/product/category-pills.tsx`

**Before** (relevant snippet):

```tsx
{categories.map((cat) => (
  <button key={cat.id} …>
    {t(`category.${cat.slug}`)}
  </button>
))}
```

**After:**

```tsx
{categories.filter((cat) => cat.visible_on_home !== false).map((cat) => (
  <button key={cat.id} …>
    {t(`category.${cat.slug}`)}
  </button>
))}
```

**Rationale:** `!== false` (rather than `=== true`) keeps the
component tolerant to older cached payloads that lack the field
during rollout — anything that isn't explicitly `false` is treated
as visible. After the rollout this can be tightened to `cat.visible_on_home`.

### Step 2: Nothing else

Explicitly **do not** filter inside `useCategories()` or the
`/api/categories` query — other call sites (e.g., product detail
category link lookups, the admin product form via the admin's
`useCategories`) depend on the complete list. The filter stays
local to the pill rack.

## Testing Steps

1. Toggle `other` off in the admin feature-flags page. Open / reload
   the customer home page. Confirm the `公告 / Notice` pill is gone,
   the "全部 / All" button still works, and clicking another pill
   still filters correctly.
2. Toggle `other` back on. After the TanStack `['api','categories']`
   cache invalidates (admin-side mutation already invalidates it
   cross-tab in the same browser; otherwise wait out `staleTime` or
   reload), the pill returns.
3. Deep-link to `/?category=other` while `other` is hidden. The
   product listing for that category still resolves (server-side
   filter is unaffected) — we only hid the _pill_, not the category
   itself. Confirm the page still displays the products, just
   without the pill being present in the rack.
4. Regression: the admin product form's category dropdown still
   lists every category, including hidden ones.

## Dependencies

- Depends on: `backend-api.md` (migration + shared type bump).
- No dependency on `admin-frontend.md` — the customer filter works
  as soon as the DB column exists and the endpoint returns it,
  regardless of whether the admin UI is reachable.

## Notes

- **Deep link still resolves**: the `?category=<slug>` filter is
  server-side, using `categories.slug`, not `visible_on_home`. A
  user with an old bookmark to a hidden category still gets the
  products — this is intentional; the flag is about _advertising_
  the category, not access-controlling it.
- **SEO / SSR**: `frontend` is Next.js App Router. The pill render
  is a client component (`'use client'`), so filtering happens
  client-side and the page's SSR payload already includes the field
  thanks to the shared type. No Next.js-specific work is required.
- **If we ever want server-side filtering** (e.g., to shrink the
  payload): add `?home_only=true` to `/api/categories` and have the
  pill component hit that specialized query. Not worth doing now —
  the full category set for this shop is trivially small.
