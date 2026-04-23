# Implementation Plan: Shared i18n Package

## Overview

Move `zh.json` and `en.json` from `frontend/src/i18n/` into `shared/src/i18n/`, and expose them through `@repo/shared` so the backend (startup sync), the customer frontend (locale merge), and the admin frontend (default-value labels + reset target) all read from a single source.

This is the foundation for every other module in FEAT-7 — do it first.

## Files to Modify

### Shared Package

- `shared/src/i18n/zh.json` — **new** (moved from `frontend/src/i18n/zh.json`).
- `shared/src/i18n/en.json` — **new** (moved from `frontend/src/i18n/en.json`).
- `shared/src/i18n/defaults.ts` — **new**. Typed re-exports of the JSON plus a `NestedRecord` type.
- `shared/src/index.ts` — re-export from `./i18n/defaults`.
- `shared/tsconfig.json` — add `"resolveJsonModule": true`.

### Frontend

- `frontend/src/i18n/zh.json` — **deleted** (moved).
- `frontend/src/i18n/en.json` — **deleted** (moved).
- `frontend/src/hooks/use-locale.ts` — change imports from `../i18n/zh.json` / `en.json` to `defaultContent` from `@repo/shared`.
- `frontend/src/i18n/merge-overrides.ts` — if `NestedRecord` is still exported locally here, keep it or switch callers to the shared one. Either works; pick whichever minimizes churn.

### Admin Frontend

- `admin-frontend/tsconfig.json` — remove the `@frontend-i18n/*` path alias.
- `admin-frontend/vite.config.ts` — remove any resolve alias for `@frontend-i18n`.
- `admin-frontend/src/lib/content-keys.ts` — change imports to `defaultContent` from `@repo/shared`. (This file itself may be deleted later in the admin-frontend-editor plan; for this step just rewire the imports so the app still builds.)

### Backend

- `backend/tsconfig.json` — no change needed; already imports `@repo/shared`.

## Step-by-Step Implementation

### Step 1: Enable JSON imports in the shared package

**File:** `shared/tsconfig.json`

**Change:** add `"resolveJsonModule": true` under `compilerOptions`.

**Rationale:** without this, `import zh from './zh.json'` won't type-check. Shared builds CJS, so the JSON will be inlined into the emitted `dist/index.js` via the usual TS module transpilation.

### Step 2: Move the JSON files

**Commands:**

```
git mv frontend/src/i18n/zh.json shared/src/i18n/zh.json
git mv frontend/src/i18n/en.json shared/src/i18n/en.json
```

**Rationale:** `git mv` keeps history. No content change.

### Step 3: Create the typed default-content module

**File:** `shared/src/i18n/defaults.ts` (new)

**Content:**

```ts
import zh from './zh.json';
import en from './en.json';

export type NestedRecord = { [key: string]: string | NestedRecord };

export const defaultContent = {
  zh: zh as NestedRecord,
  en: en as NestedRecord,
};

export type DefaultContent = typeof defaultContent;
export type Locale = keyof DefaultContent; // 'zh' | 'en'
```

**Rationale:** wrapping the JSON behind a typed module means consumers import one symbol (`defaultContent`) and don't have to re-cast at every call site. Also gives us a central place to add a helper like `flattenDefaults()` if needed later.

### Step 4: Re-export from the shared entrypoint

**File:** `shared/src/index.ts`

**Change:** add `export * from './i18n/defaults';`.

**Rationale:** consumers write `import { defaultContent } from '@repo/shared'` — consistent with how other shared exports are already consumed.

### Step 5: Rewire the customer frontend

**File:** `frontend/src/hooks/use-locale.ts`

**Changes:**

- Replace:
  ```ts
  import zhMessages from '../i18n/zh.json';
  import enMessages from '../i18n/en.json';
  ```
  with:
  ```ts
  import { defaultContent } from '@repo/shared';
  ```
- Replace:
  ```ts
  const baseMessages: Record<Locale, NestedRecord> = {
    zh: zhMessages as NestedRecord,
    en: enMessages as NestedRecord,
  };
  ```
  with:
  ```ts
  const baseMessages = defaultContent;
  ```

**Rationale:** removes the now-deleted relative imports. `defaultContent` is already typed, so no cast needed.

### Step 6: Rewire the admin frontend

**File:** `admin-frontend/src/lib/content-keys.ts`

**Changes:**

- Replace:
  ```ts
  import zhDefaults from '@frontend-i18n/zh.json';
  import enDefaults from '@frontend-i18n/en.json';
  ```
  with:
  ```ts
  import { defaultContent } from '@repo/shared';
  const zhDefaults = defaultContent.zh;
  const enDefaults = defaultContent.en;
  ```

**File:** `admin-frontend/tsconfig.json`

**Change:** delete the `@frontend-i18n/*` entry from `compilerOptions.paths`.

**File:** `admin-frontend/vite.config.ts`

**Change:** delete any `@frontend-i18n` entry from `resolve.alias`.

**Rationale:** the path alias exists only to reach the frontend's `src/i18n/` folder cross-workspace. Once the JSON is in `shared`, the alias is dead code. Leaving it behind invites confusion later.

### Step 7: Rebuild and verify

Run:

```
npm run build
```

from repo root. Turbo will build `shared` first, then the two frontends and the backend. Expect: zero type errors. A TS error like `Cannot find module '../i18n/zh.json'` means a consumer was missed in Step 5 or 6.

## Testing Steps

1. `npm run build` from root — must succeed in one pass.
2. `npm run dev` — verify:
   - Customer frontend `http://localhost:3001` still renders Chinese text (e.g. nav items).
   - Admin frontend `http://localhost:3002/dashboard/content` still lists all the content keys.
3. `npm run test` from root — any existing snapshots or test fixtures that import from `frontend/src/i18n/*.json` must be updated to import from `@repo/shared`.
4. grep the repo for the deleted paths to be sure nothing was left behind:
   - `frontend/src/i18n/zh.json`
   - `frontend/src/i18n/en.json`
   - `@frontend-i18n`

## Dependencies

- **Must complete before:** every other FEAT-7 implementation plan. The backend sync service directly imports `defaultContent`; the admin editor rewrite uses the same import.
- **Depends on:** none — this is the entry point.

## Notes

- `frontend/src/i18n/` still contains `config.ts`, `utils.ts`, `merge-overrides.ts`. These stay put — they are customer-frontend-specific helpers. Only the JSON payloads move.
- `@repo/shared` emits CJS. The JSON inlines fine into that output; consumers on the Next.js side (ESM) get it back through the same CJS/ESM interop that already handles the rest of the shared package. No special Vite config change needed beyond removing the dead `@frontend-i18n` alias.
- If `admin-frontend/src/lib/content-keys.ts` ends up unused after the admin editor rewrite (see `admin-frontend-editor.md`), delete it in that plan, not here.
