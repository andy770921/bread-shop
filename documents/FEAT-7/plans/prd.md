# PRD: DB-Backed Site Content (Pre-Filled Admin Editor)

## Problem Statement

On `https://papa-bread-admin.vercel.app/dashboard/content`, every text input starts empty — the visible Chinese/English strings are only the `placeholder` and the helper text below the input (e.g. `預設：首頁`). This is confusing because:

- Operators think nothing is set and don't know whether the site is actually running the default or an empty value.
- There is no single place to see "what is my site currently saying?" — you have to read JSON (source of truth for defaults) plus DB (source of overrides) together.
- The current `value ?? ''` initialization, combined with the merge rule `val !== ''`, makes deliberately-blank strings impossible: if an operator clears an input and saves, the customer frontend silently falls back to the JSON default anyway.

## Solution Overview

Shift the source of truth for content **values** into Postgres. The i18n JSON files remain in the repo, but only as (a) the first-time seed, (b) the developer-facing schema for new keys, and (c) the "default value" an operator can reset back to.

Concretely:

1. **Move** `zh.json` / `en.json` from `frontend/src/i18n/` to `shared/src/i18n/` so all three workspaces (`frontend`, `admin-frontend`, `backend`) share one copy.
2. **Add a startup sync** in the backend: on `OnModuleInit`, iterate every flattened key in the JSON and `INSERT … ON CONFLICT DO NOTHING` into `site_content`. Existing rows are never overwritten.
3. **Rewire the admin editor** to treat the DB response as the source of truth for input values. Because sync guarantees every key has a row, every input renders with its real current value on mount. The JSON default is still shown as a helper label ("Default: …") and is what "Reset to default" writes back.
4. **Change reset semantics**: `POST /api/admin/site-content/:key/reset` updates `value_zh` and `value_en` back to the JSON defaults without deleting the row. The existing DELETE endpoint is removed (orphan-cleanup is out of scope for v1).
5. **Allow deliberate blanks**: storing an empty string counts as a real override. The customer frontend's merge logic stops treating `''` as "fall back to default".
6. **Fix the tabs layout**: a latent Tailwind variant bug in the shared `Tabs` primitive makes the page render as accidental side-by-side layout (empty area left, cards pushed right). Register the missing `data-horizontal` / `data-vertical` custom variants so tabs appear on top and cards span full width, matching the intended shadcn design. Details in `development/admin-ui-tabs-fix.md`.

Rationale for each decision is captured in `json-usage-decision.md` (same folder).

## User Stories

1. As a **shop operator**, when I open the content admin page, I want every input to already show the text currently live on the customer site, so I can tell what needs editing without cross-referencing code.
2. As a **shop operator**, when I clear an input and save, I want the customer site to actually render an empty string, so I have an explicit way to hide a label without editing code.
3. As a **shop operator**, when I press "Reset to default", I want the input to immediately show the engineering default and I want the customer site to show that same default after its next refetch, so rollback is a one-click operation.
4. As a **developer**, when I add a new content key (e.g. `about.history.title`) to the JSON files and deploy, I want the key to appear in the admin editor on the next boot without running a manual seed script, so adding copy ships cleanly with the PR.
5. As a **developer**, when I rename an existing key in the JSON, I want the old row in `site_content` to remain untouched (orphaned, not auto-deleted), so an accidental typo in a PR cannot silently wipe operator edits.

## Acceptance Criteria

- Admin content page: every input's `value` prop is populated on first render using the DB response. No input renders empty unless the DB row explicitly holds an empty string.
- Saving an empty input results in a DB row with `value_zh = ''` (or `value_en = ''`). The customer frontend renders that as an empty string, not the JSON default.
- "Reset to default" button: sets the DB row's `value_zh` and `value_en` back to the JSON defaults, returns the updated row, and the input re-renders with the default value. No DB row is deleted.
- Backend startup in a fresh database: `site_content` contains one row per flattened key, values taken from JSON.
- Backend startup in an existing database where some keys already have operator edits: those edits are preserved; only missing keys are inserted.
- Adding a new key to the JSON and redeploying: that key shows up in the admin editor after the first post-deploy request, without manual intervention.
- Customer frontend: continues to refetch content on window focus and staleTime expiry (5 min). No new dependency, no new infrastructure.

## Implementation Decisions

### Modules

- **Shared i18n package** (`shared/src/i18n/`):
  Exports `defaultContent = { zh, en }` as plain imported JSON. Single source of truth for the default-value seed and the per-locale key tree.
- **Backend `SiteContentSyncService`** (new, in `backend/src/site-content/`):
  Implements `OnModuleInit`. On boot, flattens `defaultContent`, loads existing keys from `site_content`, and upserts only the missing ones. Never overwrites existing rows. Logs count of inserted keys. Failures are logged but do not block boot.
- **Backend `ContentAdminService` (modified)**:
  `upsert(key, dto, userId)` stays. `remove(key)` is replaced by `resetToDefault(key, userId)` which writes JSON defaults into `value_zh` and `value_en` for that row.
- **Admin `ContentEditor` / `ContentKeyRow` (modified)**:
  Key list and values now come from the DB response. `getContentGroups()` is replaced by a grouping helper that operates on the DB response, using the dot-prefix of each key as the section. JSON defaults still imported for the "Default: …" helper label and client-side reset.
- **Customer `mergeOverrides` (modified)**:
  Stop treating empty string as "fall back". Rule becomes: `if (val != null) flat[key] = val`.
- **Admin global CSS (modified)**:
  Register `@custom-variant data-horizontal` and `@custom-variant data-vertical` in `admin-frontend/src/globals.css` so every `data-horizontal:` / `group-data-horizontal/tabs:` class in the shared `Tabs` primitive begins matching the Radix `data-orientation="…"` attribute. This is the minimal fix that restores the tabs-on-top design without rewriting the shadcn-generated component source.

### Architecture

```
                 ┌───────────────────────┐
                 │ shared/src/i18n       │
                 │   zh.json, en.json    │
                 └───────────┬───────────┘
                             │ imported at build time by all 3 workspaces
         ┌───────────────────┼─────────────────────┐
         ▼                   ▼                     ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ frontend         │ │ admin-frontend   │ │ backend          │
│ (customer)       │ │ (admin editor)   │ │ SyncService      │
│                  │ │                  │ │  onModuleInit    │
│ useSiteContent() │ │ useAdminSite…()  │ │   upsert missing │
│   mergeOverrides │ │   render inputs  │ │                  │
│   (no '' fallback│ │   from DB values │ │ Admin endpoints  │
└────────┬─────────┘ └────────┬─────────┘ │   PUT upsert     │
         │                    │           │   POST …/reset   │
         └─────── HTTP ───────┴───────────┤   GET list       │
                                          └────────┬─────────┘
                                                   ▼
                                          ┌──────────────────┐
                                          │ Postgres         │
                                          │   site_content   │
                                          │ (fully populated)│
                                          └──────────────────┘
```

Why Option B-2 (startup sync) and not a migration / npm script:
- Every environment that runs the backend is guaranteed to be synced, including brand-new dev setups — no "remember to run `npm run seed`" step.
- Works naturally on Vercel serverless: the sync runs during the lazy NestJS init on the first cold start after a deploy.
- Idempotent by design (`INSERT … ON CONFLICT DO NOTHING`), so repeated cold starts don't thrash the DB.

### APIs / Interfaces

All paths below are under the existing `AdminAuthGuard`, matching the existing admin module.

- `GET /api/admin/site-content` — unchanged response shape `{ overrides: SiteContentEntry[] }`, but the list is now guaranteed complete (one entry per flattened JSON key) after first sync.
- `PUT /api/admin/site-content/:key` — unchanged. Body `{ value_zh?, value_en? }`. Empty string is a valid value (no longer coerced to null by the admin UI).
- `POST /api/admin/site-content/:key/reset` — **new**. No body. Looks up the JSON default for `:key`, writes those into `value_zh` and `value_en`, returns the updated row. 404 if `:key` not in JSON.
- `DELETE /api/admin/site-content/:key` — **removed**. (Orphan cleanup is intentionally out of scope; if needed later it can be added as a separate endpoint guarded differently.)
- `GET /api/site-content` — unchanged. Still returns all rows for the customer frontend.

Shared types (in `@repo/shared`):

```ts
export interface SiteContentEntry {
  key: string;
  value_zh: string | null;  // '' is valid; null only for rows mid-migration
  value_en: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type UpdateSiteContentRequest = {
  value_zh?: string | null;
  value_en?: string | null;
};

// New:
export type DefaultContent = { zh: NestedRecord; en: NestedRecord };
export const defaultContent: DefaultContent;  // exported from @repo/shared
```

## Testing Strategy

- **Backend unit tests** (`backend/src/site-content/site-content-sync.service.spec.ts`):
  - On an empty `site_content` table, `onModuleInit` inserts one row per flattened JSON key.
  - On a table where some keys already have non-default values, `onModuleInit` does not touch those rows.
  - If a Supabase error occurs during sync, the service logs and returns without throwing (does not block boot).
- **Backend unit tests** (`backend/src/admin/content-admin.service.spec.ts`):
  - `upsert` with `value_zh: ''` writes an empty string (not coerced).
  - `resetToDefault(key)` writes the JSON default values and sets `updated_by` to the caller's user id.
  - `resetToDefault` on an unknown key throws `NotFoundException`.
- **Admin-frontend component test** (`admin-frontend/src/routes/dashboard/content/ContentEditor.spec.tsx`):
  - Mount with a mocked `useAdminSiteContent` returning known rows. Assert each input's `value` matches the mocked row, not empty and not the placeholder.
  - Clear an input, click Save → mutation called with `{ value_zh: '', … }`.
  - Click Reset → mutation called with the reset endpoint, input re-renders to JSON default.
- **Customer-frontend unit test** (`frontend/src/i18n/merge-overrides.spec.ts`):
  - Override with `value_zh: ''` renders as empty string (not JSON default).
  - Override with `value_zh: null` falls back to JSON default.
- **Manual end-to-end**:
  1. Blow away `site_content`, boot backend, confirm table is fully populated.
  2. Edit one key in admin, confirm customer frontend updates on next window-focus refetch (≤ 5 min).
  3. Clear one key and save, confirm customer frontend renders empty string.
  4. Reset that key, confirm customer frontend renders JSON default.
  5. Add a new `about.test` key to JSON, redeploy, confirm key appears in admin without manual seed.

## Out of Scope

- Orphan key detection and cleanup UI (keys removed from JSON remain as idle rows).
- Audit trail beyond `updated_by` / `updated_at` (no history table, no diff view).
- Bulk import / export of content.
- Adding additional locales beyond `zh` and `en`.
- Supabase Realtime push updates to the customer frontend — explicitly rejected; existing `staleTime: 5min` + `refetchOnWindowFocus` is considered sufficient.
- Replacing or migrating `getContentGroups()` in a way that eliminates the JSON dependency on the admin side — JSON is still the source of the "Default: …" helper and the Reset target.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
