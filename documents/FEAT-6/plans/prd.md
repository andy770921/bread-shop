# PRD: Admin Frontend Bilingual UI (zh / en)

## Problem Statement

`admin-frontend` is currently zh-only. The `useLocale()` hook exists but is hard-coded to `DEFAULT_LOCALE='zh'`, there is no `en.json`, and there is no UI control to switch languages. Staff who prefer English (or non-Chinese-reading collaborators reviewing the backoffice) cannot use the dashboard.

The customer-facing frontend (`frontend/`) already supports zh/en with a working toggle pattern. The admin should adopt the same pattern so behaviour and code style stay consistent across the monorepo.

## Solution Overview

Extend the existing admin i18n module from a single locale to two:

1. Add a static `en.json` translation file alongside `zh.json` in `admin-frontend/src/i18n/`.
2. Upgrade `useLocale()` so the active locale is **state**, not a constant — backed by `localStorage` for persistence across sessions, with a `toggleLocale()` action.
3. Add a small `LocaleToggle` button component, and place it in two locations:
   - The login page card header (top-right of the card, visible before authentication).
   - The dashboard `Topbar` (next to the dark-mode toggle).
4. Mirror the existing `frontend/` patterns where applicable so the two i18n implementations stay structurally aligned.

This is a frontend-only change. No backend, DB, or shared-types changes required. The `site_content` overrides system that the customer frontend uses is intentionally **not** introduced here — admin copy lives entirely in static JSON.

## User Stories

1. As an English-speaking shop staff member, I want to switch the admin dashboard to English so I can perform my job without relying on machine translation.
2. As a returning user, I want my language choice to be remembered across sessions so I don't have to re-toggle on every login.
3. As an unauthenticated user landing on the login page, I want to switch the language **before** logging in so the login form itself is readable.
4. As a developer, I want admin and customer i18n to follow the same shape (`useLocale().t(key)`, JSON files keyed by section) so I only learn one pattern.

## Acceptance Criteria

- `admin-frontend/src/i18n/en.json` exists with the same key tree as `zh.json` and provides an English translation for every key.
- `useLocale()` exposes `{ locale, t, toggleLocale }`.
- The active locale is read from `localStorage` on first render (key: `admin_locale`); writes persist on every toggle.
- A `LocaleToggle` component renders the opposite locale's label (e.g. shows "EN" when current is `zh`, "中文" when current is `en`) and switches on click.
- The toggle is visible on the login page card header and on the dashboard `Topbar`.
- Switching locale immediately updates **all** rendered text (no full page reload).
- The `<html lang="…">` attribute updates to the IETF tag (`zh-TW` or `en`) when locale changes.
- All existing `t('…')` call sites continue to compile and behave the same.
- TypeScript build (`npm run build`), tests (`npm run test`), and lint (`npm run lint`) all pass.

## Implementation Decisions

### Modules

- **i18n config (`admin-frontend/src/i18n/config.ts`)** — declares the supported locale union (`'zh' | 'en'`) and the default. Replaces the current single-value type.
- **i18n utils (`admin-frontend/src/i18n/utils.ts`, new)** — `getOppositeLocale` and `toIntlLocale` helpers, mirroring `frontend/src/i18n/utils.ts`. Kept local to the admin app rather than promoted to `@repo/shared` because it's a small, project-local helper.
- **Locale provider (`admin-frontend/src/hooks/use-locale.ts`)** — upgraded from a constant-locale provider to a state-backed provider. Exposes `toggleLocale`. Persists to `localStorage`. Updates `document.documentElement.lang` in an effect.
- **`LocaleToggle` component (`admin-frontend/src/components/LocaleToggle.tsx`, new)** — small button using the existing shadcn `Button` (variant `ghost`, `size icon` or `sm`). Calls `toggleLocale()` on click. Self-contained; no props.
- **Login page integration** — `LocaleToggle` placed in the `CardHeader` next to the title.
- **Topbar integration** — `LocaleToggle` placed before the dark-mode toggle in `Topbar`.

### Architecture

- **Why static JSON, not site_content overrides**: admin copy is for internal staff and changes via dev workflow, not from the dashboard itself. Pulling overrides would also create a chicken-and-egg problem (the editor for overrides is itself in the admin frontend). Static JSON keeps the admin self-contained and immune to the DB being slow/unreachable.
- **Why mirror the customer frontend instead of a fresh implementation**: reduces cognitive overhead. Future changes to the locale pattern can be applied symmetrically in both apps.
- **Why not extract i18n into `@repo/shared`**: the two apps differ on overrides (customer merges DB rows; admin doesn't), default locale source (admin uses localStorage only; customer uses localStorage with SSR fallback for Next), and JSON content (entirely different keys). Sharing would force coupling without meaningful reuse. Revisit only if a third frontend appears.
- **localStorage key namespacing**: use `admin_locale` (not `locale`) so it doesn't collide with the customer frontend's persisted preference if both apps are ever opened in the same browser profile.

### APIs/Interfaces

```ts
// admin-frontend/src/i18n/config.ts
export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh';

// admin-frontend/src/i18n/utils.ts
export function getOppositeLocale(locale: Locale): Locale;
export function toIntlLocale(locale: Locale): string; // 'zh' -> 'zh-TW', 'en' -> 'en'

// admin-frontend/src/hooks/use-locale.ts
interface LocaleContextType {
  locale: Locale;
  t: (key: string) => string;
  toggleLocale: () => void;
}
```

No backend or shared-types changes.

## Testing Strategy

- **Unit (vitest, optional)**: a small spec for `getOppositeLocale` and the `t()` lookup behaviour (existing key returns string, missing key returns the key itself).
- **Manual smoke (Playwright MCP)**:
  1. Open `http://localhost:3002/`, verify the login card shows the toggle and Chinese copy.
  2. Click the toggle, verify all login-page text becomes English and the toggle now shows "中文".
  3. Refresh the page, verify the choice persisted (`admin_locale=en` in localStorage).
  4. Log in (`admin@admin.com` / `admin123`), verify the dashboard renders in English.
  5. Click the toggle in the topbar, verify all dashboard text — sidebar nav, KPI cards, recent-orders table headers, top-products list, status breakdown — switches to Chinese.
  6. Verify `document.documentElement.lang` flips between `zh-TW` and `en`.
- **Type-check**: `cd admin-frontend && npx tsc -b` must pass; the upgraded `Locale` type may surface places that assumed `Locale = 'zh'`.

## Out of Scope

- Adding new languages beyond zh and en.
- Per-user locale preference stored on the backend (uses localStorage only).
- Translating the customer-facing `site_content` override editor's "section" labels (those follow customer-frontend keys; left as-is for now).
- Auto-detecting locale from `Accept-Language` headers or browser settings — defaults to `zh` and only changes when the user toggles.
- Localising data returned from the backend (e.g. order status, product names — those continue to come from the API as-is).
- Changes to the customer frontend's i18n.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
