# PRD: FEAT-8 — Admin Feature Flags (first flag: home-visible categories)

> Ticket: **FEAT-8** (new). Folder created at `documents/FEAT-8/`.

## Problem Statement

The customer home page renders **every** row from the `categories` table as a
pill ("全部 / 吐司 / 蛋糕 / 餅乾 / 麵包 / 公告"). Shop staff currently have no
way to hide a category from the home page without deleting or renaming the
row — both of which would also break products already assigned to that
category, existing product listing pages, and the admin product form.

A concrete need from the attached screenshot (home hero + pill rack):
someone has already repurposed `category.other` into an "公告" / "Notice"
label (via the FEAT-6 content editor), but they cannot _hide_ it from the
home page when no announcement is active.

More generally, we want a durable place in the admin backoffice to hold
small "operational" toggles like this one — things that don't warrant a
new domain object each time, but also shouldn't be wedged into the
`site_content` i18n table because they're not strings.

## Solution Overview

Introduce a new admin section called **功能開關 / Feature Flags** at
`/dashboard/feature-flags`. The first flag lives under the heading
**首頁顯示類別 / Home-visible Categories** and is rendered as a row of
checkboxes — one per category row from the database — labeled using the
customer's localized category names (via the FEAT-6 `useContentT` hook
so overrides like `category.other → 公告` are honored).

Under the hood we add a boolean column to the `categories` table
(`visible_on_home`, default `true`). The customer `GET /api/categories`
endpoint gains that field and the customer pill rack filters by it. An
admin-only endpoint lets staff replace the visible set as a single
transaction.

The page is structured to grow: each future flag is a separate section
in the same page; no new route / module wiring needed per flag.

## User Stories

1. **As a shop owner**, I want to temporarily hide the `公告 / Notice`
   category from the customer home page when there's no active
   announcement, so the home pill rack doesn't advertise an empty
   section.
2. **As shop staff**, I want the category names in the toggle list to
   match exactly what customers see on the site (including my own
   i18n overrides), so I'm never guessing which `slug` is which.
3. **As a shop owner using the English admin UI**, I want the
   Feature Flags page labels (section titles, helper text, save
   button) to be in English; switching to Chinese should flip them
   all at once.
4. **As a developer**, I want the new flag to live next to existing
   category data (not in a magic key-value bucket), so queries remain
   strongly typed and the customer endpoint can filter trivially in
   SQL.
5. **As a developer adding the next flag later**, I want to drop a new
   section into the same admin page without a new route, guard, or
   sidebar entry.

## Implementation Decisions

### Modules

- **`categories.visible_on_home` column** — single source of truth for
  whether a category appears on the home pill rack. Column lives on the
  existing `categories` row; no new table.
- **Backend `FeatureFlagsAdminModule`** —
  `GET /api/admin/feature-flags` (aggregate read of all current flag
  values) and
  `PUT /api/admin/feature-flags/home-visible-categories` (replace the
  set). Protected by the existing `AdminAuthGuard`.
- **Customer `/api/categories` extension** — same endpoint, now returns
  `visible_on_home` in every `Category` row. No filtering server-side
  so the admin product form (which also uses this endpoint) still sees
  every category.
- **Admin page `FeatureFlags`** — route `/dashboard/feature-flags`,
  section-per-flag layout. First section renders a `CategoryCheckbox`
  group fed by `useCategories()` + `useContentT()`. Saves via a single
  mutation.
- **Shared UI `Checkbox`** — new shadcn/Radix-based component at
  `admin-frontend/src/components/ui/checkbox.tsx`, used by the feature
  flags page and available for future use.
- **Admin i18n namespace `featureFlags`** — new top-level key in
  `admin-frontend/src/i18n/{zh,en}.json` holding title, section
  heading, help copy, save / saving / saved labels, and validation
  strings. Nav label added under `nav.featureFlags`.

### Architecture

- **Why a column, not a separate `feature_flags` table**: the current
  flag is a relationship between two domain concepts we already have
  (`categories` and "the home page"). Putting it on `categories` keeps
  foreign-key integrity, makes the customer query a one-line `WHERE`,
  and avoids the kind of stringly-typed `get_flag('…')` code that
  accumulates in key-value settings tables. Future flags that are
  genuinely independent (e.g., "enable LINE checkout") can introduce
  their own columns on relevant tables, or a `feature_flags` table can
  be added later once a second flag actually needs it. We refuse to
  predict future flag shapes.
- **Why a single `PUT` with the full set, not per-category toggles**:
  avoids partial-update consistency issues (what if one toggle
  succeeds and the next fails?) and matches the checkbox-form-with-
  Save-button UX the screenshot implies. One round trip to save, one
  mutation to invalidate.
- **Why expose `visible_on_home` in the public `/api/categories`**: the
  customer frontend already hydrates that endpoint; filtering on the
  client lets us keep the admin product-form's dropdown (also hitting
  `/api/categories`) complete without a parallel admin-specific
  endpoint. Filtering customer-side also means adding the column is
  backwards-compatible — old builds see the extra field and ignore it.
- **Why new route + `useContentT` instead of reusing the content
  editor**: the content editor (FEAT-6) is for **strings**. This is a
  **typed boolean**. Putting them in one page would conflate two
  mental models.

### APIs / Interfaces

Backend:

- `GET /api/admin/feature-flags` →
  `{ homeVisibleCategoryIds: number[] }`. Returns the IDs of
  categories whose `visible_on_home = true`. Guarded by
  `AdminAuthGuard`. Shape is an object (not a bare array) so later
  flags can be appended as siblings.
- `PUT /api/admin/feature-flags/home-visible-categories` with body
  `{ category_ids: number[] }` → `{ homeVisibleCategoryIds: number[] }`.
  Replaces the visible set: sets `visible_on_home = true` on the
  listed IDs and `false` on the rest, in a single Supabase call.
  Guarded by `AdminAuthGuard`. Validated such that every ID exists in
  `categories`; at least one ID must be present.
- `GET /api/categories` (public, existing) — same URL and
  query-parameter contract, response's `Category` objects now include
  `visible_on_home: boolean`.

Frontend (customer):

- `CategoryPills` filters `categories.filter(c => c.visible_on_home)`
  before rendering. Nothing else changes.

Frontend (admin):

- `useFeatureFlags()` — TanStack `useQuery` keyed
  `['api', 'admin', 'feature-flags']`.
- `useUpdateHomeVisibleCategories()` — TanStack `useMutation`;
  on success invalidates both `['api', 'admin', 'feature-flags']` and
  the public `['api', 'categories']` cache (so the admin-side product
  form sees fresh data if anyone navigates there).

Shared types (`@repo/shared`):

- `Category.visible_on_home: boolean` (non-optional, defaults to
  `true` at the DB level so existing rows read back as `true`).
- New `types/feature-flags.ts` exporting `FeatureFlagsResponse`
  (`{ homeVisibleCategoryIds: number[] }`) and
  `UpdateHomeVisibleCategoriesRequest`
  (`{ category_ids: number[] }`).

## Testing Strategy

- **Backend unit tests** (`feature-flags-admin.service.spec.ts`):
  read returns correct IDs from a mocked Supabase query; write rejects
  empty array, rejects unknown IDs, writes the correct diff.
- **Backend e2e**: PUT then GET returns the just-written set; without
  admin Bearer token both routes return 401/403.
- **Customer frontend**: existing home-page component test extended
  so that a category with `visible_on_home: false` is filtered out of
  the rendered pills.
- **Admin frontend**: smoke test on the Feature Flags page that
  ticking a checkbox and clicking save fires the mutation with the
  expected body, and that a zero-selection state disables save.
- **Manual**: toggle `other` off in the admin UI, reload customer
  home, confirm the `公告` pill disappears; toggle back on, confirm
  it returns. Flip admin locale to `en`, confirm all page strings flip.

## Out of Scope

- A generic `feature_flags` key-value table. If a non-category flag
  lands next, we'll decide its storage at that point.
- Per-locale visibility (e.g., show `toast` to zh users only). Not
  requested; no obvious use case today.
- Changing `sort_order`. The existing category ordering flow stays
  unchanged; this feature only gates visibility.
- Audit trail for flag changes (who toggled what when). Can be added
  later by adopting the `updated_by` / `updated_at` pattern used by
  `site_content` if demand appears.
- Editing category _labels_ from this page — that already exists in
  the FEAT-6 content editor.
- Feature flags that affect the admin frontend itself.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
