# Implementation Plan: Customer Frontend Merge Fix

## Overview

One small but critical behavioral fix on the customer frontend: the `mergeOverrides` function currently treats an empty string DB value as "fall back to JSON default". Under FEAT-7, an empty string is a deliberate override, so it must flow through to the UI as empty.

No other change is needed on the customer frontend. `staleTime: 5min` and `refetchOnWindowFocus` (default true) are explicitly sufficient per the PRD — no realtime subscription, no polling.

## Files to Modify

- `frontend/src/i18n/merge-overrides.ts` — change one conditional.

## Step-by-Step Implementation

### Step 1: Honor empty string as a deliberate value

**File:** `frontend/src/i18n/merge-overrides.ts`

**Current code** (line 42-46):

```ts
for (const o of overrides) {
  const val = locale === 'zh' ? o.value_zh : o.value_en;
  if (val != null && val !== '') {
    flat[o.key] = val;
  }
}
```

**New code:**

```ts
for (const o of overrides) {
  const val = locale === 'zh' ? o.value_zh : o.value_en;
  if (val != null) {
    flat[o.key] = val;
  }
}
```

**Rationale:** the whole point of the FEAT-7 empty-input story is "an operator who clears a label really means to blank it". The old guard was there because, before FEAT-7, the admin editor stored `null` on save-empty _and_ the DB only held rows for edited keys — so both `null` and `''` meant "unset". Now:

- `null` in the DB still means "unset / not yet touched by migration" — extremely rare now that sync populates every row, but the fallback is still useful when `GET /api/site-content` races ahead of the sync on a first cold start.
- `''` means "explicitly empty". Must not fall back.

### Step 2: Update the unit test

**File:** `frontend/src/i18n/merge-overrides.spec.ts` (may or may not already exist)

**Expected tests:**

```ts
import { mergeOverrides } from './merge-overrides';

describe('mergeOverrides', () => {
  const defaults = { nav: { home: '首頁', about: '關於我們' } };

  it('uses the override value when present', () => {
    const result = mergeOverrides(
      defaults,
      [{ key: 'nav.home', value_zh: '主頁', value_en: 'Main', updated_at: '', updated_by: null }],
      'zh',
    );
    expect(result).toEqual({ nav: { home: '主頁', about: '關於我們' } });
  });

  it('honors an empty string override as a deliberate blank', () => {
    const result = mergeOverrides(
      defaults,
      [{ key: 'nav.home', value_zh: '', value_en: '', updated_at: '', updated_by: null }],
      'zh',
    );
    expect(result).toEqual({ nav: { home: '', about: '關於我們' } });
  });

  it('falls back to the default when the override is null', () => {
    const result = mergeOverrides(
      defaults,
      [{ key: 'nav.home', value_zh: null, value_en: null, updated_at: '', updated_by: null }],
      'zh',
    );
    expect(result).toEqual({ nav: { home: '首頁', about: '關於我們' } });
  });
});
```

**Rationale:** three cases cover the full decision table — override-with-value, override-with-empty-string, override-with-null — and lock the empty-string semantics in place so a future refactor can't regress it.

## Non-Changes (Deliberate)

- **`useSiteContent` staleTime**: stays at `5 * 60 * 1000`. Per user preference: "不做處理沒關係".
- **`refetchOnWindowFocus`**: inherits TanStack Query's default (`true`). No override.
- **Global QueryClient default** in `frontend/src/vendors/tanstack-query/provider.tsx`: unchanged.
- **No WebSocket / Supabase Realtime integration.**
- **No SSR revalidation changes.** Content page is client-rendered anyway (`'use client'`).

If someone later wants faster propagation, the smallest lever is to drop `staleTime` on just `useSiteContent`. That is not part of FEAT-7.

## Testing Steps

1. `cd frontend && npx jest src/i18n/merge-overrides.spec.ts` — three tests pass.
2. Manual: with admin editor, clear one label and save. Open the customer frontend in a fresh tab (or wait past 5 min + focus the existing tab). That label should render empty on the page, not the old JSON default.

## Dependencies

- **Must complete after:** `shared-i18n-migration.md` (the imports `mergeOverrides` uses to reference types still come from `@repo/shared`).
- **Independent of:** backend sync and admin editor — this change is load-bearing on its own for the empty-string user story.

## Notes

- If `merge-overrides.ts` is eventually moved into `@repo/shared` (not in scope for FEAT-7), the same single-line change applies there instead.
- The `!= null` form catches both `null` and `undefined`. If the backend ever returns a row without `value_zh` (unlikely), the code falls back gracefully. That's intentional.
