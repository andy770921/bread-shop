# Implementation Plan: Admin Frontend Bilingual UI

## Overview

Upgrade `admin-frontend`'s i18n module from a hard-coded `zh`-only setup to a two-locale (`zh` / `en`) setup with a user-toggleable language switch. All copy lives in static JSON; no backend, no DB, no `@repo/shared` changes.

This plan **mirrors the existing pattern in `frontend/src/i18n/`** as closely as possible — read those files first if anything below is unclear.

## Files to Modify

### Admin Frontend Changes

- `admin-frontend/src/i18n/config.ts`
  - Replace single-value `Locale` with a `('zh' | 'en')` union plus `locales` array.
  - Purpose: foundation for everything else; without this, TS won't accept `'en'` as a `Locale`.

- `admin-frontend/src/i18n/utils.ts` (new)
  - Add `getOppositeLocale(locale)` and `toIntlLocale(locale)` helpers.
  - Purpose: keep locale-toggling logic in one place; keep `<html lang>` value in one place.

- `admin-frontend/src/i18n/en.json` (new)
  - English translation for every key in `zh.json`.
  - Purpose: the actual English copy.

- `admin-frontend/src/hooks/use-locale.ts`
  - Convert `LocaleProvider` from a constant-locale provider to a state-backed provider with `localStorage` persistence and a `toggleLocale` action.
  - Wire `<html lang="…">` updates via `useEffect`.
  - Purpose: makes the locale actually switchable at runtime.

- `admin-frontend/src/components/LocaleToggle.tsx` (new)
  - Self-contained shadcn `Button` that calls `toggleLocale()` and renders the opposite locale's short label.
  - Purpose: reusable trigger; placed in two locations (Login + Topbar).

- `admin-frontend/src/routes/Login.tsx`
  - Add `LocaleToggle` inside the `CardHeader`.
  - Purpose: lets users switch language before authenticating.

- `admin-frontend/src/components/layout/Topbar.tsx`
  - Add `LocaleToggle` next to the dark-mode toggle.
  - Purpose: lets authenticated users switch language anytime.

### Files NOT Touched

- `backend/`, `shared/`, customer `frontend/`, `documents/FEAT-1..5/`.
- `admin-frontend/src/i18n/zh.json` content stays the same — but **every key in `zh.json` must also exist in `en.json`** (verify before considering done).
- `LocaleProvider` placement in `App.tsx` / `main.tsx` should already be correct from FEAT-5; do not move it.

## Step-by-Step Implementation

### Step 1: Upgrade `config.ts`

**File:** `admin-frontend/src/i18n/config.ts`

**Replace the entire file with:**

```ts
export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh';
```

**Rationale:** This matches `frontend/src/i18n/config.ts` exactly so the two apps' types align. Keep the export name `defaultLocale` (lowercase) to mirror the customer FE; if the existing admin code imported `DEFAULT_LOCALE`, update those imports in Step 4.

### Step 2: Add `utils.ts`

**File:** `admin-frontend/src/i18n/utils.ts` (new)

**Create with:**

```ts
import type { Locale } from './config';

export function getOppositeLocale(locale: Locale): Locale {
  return locale === 'zh' ? 'en' : 'zh';
}

export function toIntlLocale(locale: Locale): string {
  return locale === 'zh' ? 'zh-TW' : 'en';
}
```

**Rationale:** Same shape as `frontend/src/i18n/utils.ts`. `toIntlLocale` is used to set `<html lang>`. Skip `pickByLocale` / `pickLocalizedText` — admin doesn't yet read locale-specific fields off API responses, and adding unused helpers violates the "don't introduce abstractions you don't need" rule.

### Step 3: Add `en.json`

**File:** `admin-frontend/src/i18n/en.json` (new)

**Mirror every key from `zh.json` with English values.** Translate consistently with the customer frontend's en.json where the same word appears (e.g. status labels: `pending` → "Pending", `paid` → "Paid"; `nav.dashboard` → "Dashboard", etc.). Use sentence case for headings, title case for nav items.

**Verification:** before moving on, run a quick diff to ensure key parity:

```bash
node -e "
  const zh = require('./admin-frontend/src/i18n/zh.json');
  const en = require('./admin-frontend/src/i18n/en.json');
  const flatten = (o, p='') => Object.entries(o).flatMap(([k,v]) =>
    typeof v === 'object' ? flatten(v, p+k+'.') : [p+k]);
  const zhKeys = new Set(flatten(zh));
  const enKeys = new Set(flatten(en));
  const missing = [...zhKeys].filter(k => !enKeys.has(k));
  const extra = [...enKeys].filter(k => !zhKeys.has(k));
  if (missing.length) console.log('Missing in en:', missing);
  if (extra.length) console.log('Extra in en:', extra);
  if (!missing.length && !extra.length) console.log('OK: keys match');
"
```

**Rationale:** missing keys silently fall back to the key string itself (`t('foo.bar')` returns `'foo.bar'`), which is a confusing UX bug that's easy to miss in QA.

### Step 4: Upgrade `use-locale.ts`

**File:** `admin-frontend/src/hooks/use-locale.ts`

**Replace with the state-backed version. Key changes vs. current:**

- Import both `zhMessages` and `enMessages`; build `messages: Record<Locale, NestedRecord>`.
- Replace `const locale: Locale = DEFAULT_LOCALE;` with `useState`-backed locale read from `localStorage.getItem('admin_locale')` (fall back to `defaultLocale`).
- Add `toggleLocale = useCallback(...)` that flips the locale, writes to `localStorage`, and updates state.
- Add `useEffect` that sets `document.documentElement.lang = toIntlLocale(locale)` when locale changes.
- Update the context type to include `toggleLocale`.

**Reference implementation** (adapt to admin's import style; admin uses `@/...` path alias):

```ts
import {
  createElement,
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import zhMessages from '@/i18n/zh.json';
import enMessages from '@/i18n/en.json';
import { defaultLocale, type Locale } from '@/i18n/config';
import { getOppositeLocale, toIntlLocale } from '@/i18n/utils';

type NestedRecord = { [key: string]: string | NestedRecord };

const messages: Record<Locale, NestedRecord> = {
  zh: zhMessages as NestedRecord,
  en: enMessages as NestedRecord,
};

const STORAGE_KEY = 'admin_locale';

interface LocaleContextType {
  locale: Locale;
  t: (key: string) => string;
  toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === 'undefined') return defaultLocale;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'zh' || stored === 'en' ? stored : defaultLocale;
  });

  useEffect(() => {
    document.documentElement.lang = toIntlLocale(locale);
  }, [locale]);

  const t = useCallback(
    (key: string): string => {
      const parts = key.split('.');
      let current: unknown = messages[locale];
      for (const p of parts) {
        if (current && typeof current === 'object') {
          current = (current as NestedRecord)[p];
        } else {
          return key;
        }
      }
      return typeof current === 'string' ? current : key;
    },
    [locale],
  );

  const toggleLocale = useCallback(() => {
    setLocale((prev) => {
      const next = getOppositeLocale(prev);
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ locale, t, toggleLocale }), [locale, t, toggleLocale]);

  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}
```

**Rationale:** `useState` with a lazy initializer reads from `localStorage` exactly once on mount. `setLocale((prev) => ...)` inside `toggleLocale` keeps the callback stable across renders (no `locale` in the deps array). The `typeof window === 'undefined'` guard isn't strictly necessary for a Vite SPA but mirrors the customer FE pattern and costs nothing.

**Search for stale imports**: if any file imports `DEFAULT_LOCALE` from the old config, update to `defaultLocale`.

### Step 5: Add `LocaleToggle` component

**File:** `admin-frontend/src/components/LocaleToggle.tsx` (new)

**Create with:**

```tsx
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';

const LABELS: Record<'zh' | 'en', string> = {
  zh: '中文',
  en: 'EN',
};

export function LocaleToggle({ className }: { className?: string }) {
  const { locale, toggleLocale } = useLocale();
  const next = locale === 'zh' ? 'en' : 'zh';
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLocale}
      aria-label={`Switch language to ${LABELS[next]}`}
      className={className}
    >
      {LABELS[next]}
    </Button>
  );
}
```

**Rationale:** Showing the **opposite** locale's label is the established convention (matches the customer FE and most i18n toggles). `aria-label` includes the target language so screen readers announce the action, not just the visible glyph.

### Step 6: Place toggle on Login

**File:** `admin-frontend/src/routes/Login.tsx`

**Changes:**

- Import `LocaleToggle` from `@/components/LocaleToggle`.
- Wrap the existing `CardHeader` content so the title and the toggle sit on the same row. Easiest approach: keep `CardHeader` as-is for the centered title/subtitle, and add `<LocaleToggle className="absolute right-2 top-2" />` inside the `<Card>` (which can be set to `relative`). Alternatively, restructure `CardHeader` to a flex row.

**Suggested diff (relative-positioned toggle inside the card):**

```tsx
// Card opening tag — add `relative`
<Card className="relative w-full max-w-md shadow-md">
  <LocaleToggle className="absolute right-2 top-2" />
  <CardHeader className="space-y-2 text-center">
    {/* unchanged */}
  </CardHeader>
  {/* ... */}
</Card>
```

**Rationale:** Absolute positioning avoids reflowing the centered title/subtitle that the design currently relies on.

### Step 7: Place toggle in Topbar

**File:** `admin-frontend/src/components/layout/Topbar.tsx`

**Changes:**

- Import `LocaleToggle`.
- Insert `<LocaleToggle />` in the right-side `<div className="flex items-center gap-3">` immediately **before** the dark-mode `Button`.

**Diff sketch:**

```tsx
<div className="flex items-center gap-3">
  <LocaleToggle />
  <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)} aria-label="toggle theme">
    {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
  </Button>
  <Button variant="outline" size="sm" onClick={logout}>
    <LogOut className="mr-2 h-4 w-4" />
    {t('nav.logout')}
  </Button>
</div>
```

**Rationale:** keeps related controls (locale, theme, logout) grouped on the right.

### Step 8: Build, lint, type-check

**Run:**

```bash
cd admin-frontend && npx tsc -b && npm run lint && npm run test
cd .. && npm run build --workspace=admin-frontend
```

**Rationale:** the upgraded `Locale` type can surface stale assumptions (`Locale = 'zh'`) elsewhere in the admin code. Catching them at the type-check step is cheaper than at runtime.

## Testing Steps

### Manual smoke (Playwright MCP recommended)

1. Start dev: `npm run dev` (from monorepo root).
2. Open `http://localhost:3002/`. Verify:
   - Login card renders in Chinese.
   - Toggle button visible in the card; reads `EN`.
3. Click `EN`. Verify:
   - All login-card text becomes English: title, subtitle, labels, button.
   - Toggle now reads `中文`.
4. Refresh the page. Verify:
   - Page loads in English (persisted).
   - `localStorage.getItem('admin_locale') === 'en'` (check via DevTools).
5. Log in (`admin@admin.com` / `admin123`). Verify:
   - Sidebar nav, topbar, dashboard heading, KPI cards, recent-orders table headers, top-products list, status breakdown all in English.
6. Click `中文` in the topbar. Verify:
   - Entire dashboard switches back to Chinese without page reload.
7. Visit `/dashboard/products`, `/dashboard/content`, `/dashboard/orders`, and one order detail. Verify each page is fully translated in both locales (no raw `t('foo.bar')` strings showing through).
8. In DevTools console: `document.documentElement.lang` returns `zh-TW` when locale is `zh`, `en` when locale is `en`.

### Edge cases to confirm

- A key present in `zh.json` but **missing** from `en.json` should fall back to the key string (current `t()` behaviour). Add it to `en.json` if you find one — don't ship missing keys.
- Toggling rapidly should not cause re-render loops or lose the click (state-based; no async).
- localStorage with a junk value (`localStorage.setItem('admin_locale', 'jp')`) should fall back to `zh` on next load (the lazy initializer guards against unknown values).

## Dependencies

- Must complete before: nothing else depends on this.
- Depends on: FEAT-5 (the existing admin-frontend i18n scaffold and `LocaleProvider` mounting). Already merged.

## Notes

- **Why `admin_locale` and not `locale`**: avoids collision with the customer frontend's `localStorage` key (`locale`) if both apps are opened in the same browser profile. Zero cost to namespace it correctly from day one.
- **Why no backend/user-preference storage**: a per-account preference would require a column on `profiles` and a sync round-trip on login, for a feature with one or two users. Revisit if the staff team grows.
- **Translation source for `en.json`**: where the customer frontend already has an English equivalent (status labels, common words like "Save", "Cancel"), copy verbatim for consistency. Only translate fresh strings (admin-only labels like "重送 LINE 訊息" → "Resend LINE Message") manually.
- **Don't promote i18n to `@repo/shared`** as part of this ticket. The two implementations differ on the override-merge step and the JSON contents have no overlap; sharing forces coupling without reuse.
