# Implementation Plan: Admin Tabs Layout Fix

## Overview

The content admin page at `/dashboard/content` renders with a large empty area on the left of the main content column and all cards pushed to the right. This is **not a deliberate design** — it's the symptom of a broken Tailwind variant in the shared `Tabs` primitive.

This plan is scoped as part of FEAT-7 because the bug is most visible on the page FEAT-7 rewrites, and because the upcoming key-count explosion (every i18n key gets a DB row, sections grow from ~2 to ~10+) would make the current layout even more broken.

## Root Cause

`admin-frontend/src/components/ui/tabs.tsx` repeatedly uses `data-horizontal:` and `data-vertical:` Tailwind variants, e.g.:

- Line 18 (root): `'group/tabs flex gap-2 data-horizontal:flex-col'`
- Line 25 (list): `'... group-data-horizontal/tabs:h-8 group-data-vertical/tabs:flex-col ...'`
- Line 59 (trigger): `'... group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start ...'`
- Line 62 (trigger after-pseudo): `'... group-data-horizontal/tabs:after:bottom-[-5px] group-data-vertical/tabs:after:-right-1 ...'`

These were **authored for a shadcn "nova" preset that expects Tailwind custom variants `data-horizontal` and `data-vertical`** to be registered in the app's CSS. Those custom variants are not present in `admin-frontend/src/globals.css`. Tailwind v4 therefore compiles `data-horizontal:` as `[data-horizontal]:` — looking for an attribute literally named `data-horizontal`.

Radix Tabs, however, sets **`data-orientation="horizontal"`**, not `data-horizontal`. Every one of these variant classes silently fails to apply.

Consequence: the `Tabs` root stays `display: flex` with default `flex-direction: row`. `TabsList` (narrow, `w-fit`) lands on the left, `TabsContent` (cards) lands on the right. The "empty left area" the user saw is actually the tiny invisible TabsList next to a very wide, sparsely populated TabsContent. The page _looks_ like side-by-side layout, but it's unintentional.

Verification done:

- `admin-frontend/src/globals.css` has no `@custom-variant data-horizontal` or `data-vertical`.
- Only `ContentEditor.tsx` consumes the Tabs primitive, so the fix is safe to apply globally without regressing other pages.

## Fix Strategy

Register two custom Tailwind v4 variants in the admin frontend's CSS. This makes every existing `data-horizontal:` / `data-vertical:` / `group-data-horizontal/tabs:` / `group-data-vertical/tabs:` class in `tabs.tsx` start matching correctly, with zero change to the component file itself.

This is strictly preferable to rewriting the classes to `data-[orientation=horizontal]:` form because (a) it preserves the shadcn source so future `npx shadcn@latest` updates apply cleanly, and (b) the variants become reusable if we add more Radix components (accordion, menubar) that follow the same `data-orientation` convention.

## Files to Modify

- `admin-frontend/src/globals.css` — register two custom variants.
- `admin-frontend/src/routes/dashboard/content/ContentEditor.tsx` — confirm the `Tabs` stays in horizontal orientation (it already does — this is just a review step, no code change).

## Step-by-Step Implementation

### Step 1: Register the custom variants

**File:** `admin-frontend/src/globals.css`

**Change:** near the existing `@custom-variant dark (...)` declaration (line 4), add:

```css
@custom-variant data-horizontal (&[data-orientation='horizontal'], &[data-orientation='horizontal'] *);
@custom-variant data-vertical (&[data-orientation='vertical'], &[data-orientation='vertical'] *);
```

**Rationale:**

- The first form `&[data-orientation='horizontal']` makes variants like `data-horizontal:flex-col` on the Tabs root itself apply when it has `data-orientation="horizontal"`.
- The `, &[data-orientation='horizontal'] *` descendant form is **not** what makes `group-data-horizontal/tabs:` work — that one uses the group mechanism and matches via the group parent's data attribute. But having the variant registered is what Tailwind needs for the `group-<variant>/<group>:` shorthand to resolve at all.
- Matches the pattern the shadcn "nova" preset documents for Tailwind v4.

### Step 2: Verify behavior in the current content page

**File:** `admin-frontend/src/routes/dashboard/content/ContentEditor.tsx`

**No code change required.** The `<Tabs>` element omits the `orientation` prop, so `tabs.tsx` defaults it to `'horizontal'`, which is what we want: tabs on top, cards below.

Once Step 1 is in place:

- `Tabs` root gets `flex-col` → `TabsList` stacks above `TabsContent`.
- `TabsList` gets `h-8` and stays horizontal.
- Triggers get their bottom underline (`after:bottom-[-5px] after:h-0.5`) instead of the vertical right-edge bar.
- `TabsContent` is full-width because in a flex-column parent its default cross-axis is stretch.

### Step 3: Confirm other pages are unaffected

Grep was done: `grep 'components/ui/tabs'` in admin-frontend shows only `ContentEditor.tsx`. No other page uses Tabs, so this fix cannot regress any other view.

If future pages want vertical tabs, they pass `orientation="vertical"` on the `<Tabs>` element and the same custom variants flip everything correctly.

## Testing Steps

1. `npm run dev`, open `http://localhost:3002/dashboard/content`.
2. Expect: the section tab strip (`nav`, plus any other sections from the seeded JSON) appears as a pill row directly under the "文案管理" title. Cards span the full width of the main column.
3. With dev tools inspecting the Tabs root, confirm `data-orientation="horizontal"` is present and the computed style shows `flex-direction: column`.
4. Click between section tabs: active tab gets the filled-background state and a subtle bottom underline.

## Dependencies

- **Must complete before:** `admin-frontend-editor.md` — the editor rewrite assumes the tabs layout is working correctly, because once FEAT-7's sync seeds every key, the section count will increase and the broken layout would become obvious.
- **Independent of:** backend sync, shared i18n migration — this is purely a CSS variant registration.

## Notes

- If we later adopt more Radix primitives that key off `data-orientation` (e.g. `Separator`, `ToggleGroup`), the same two custom variants cover them at no extra cost.
- The shadcn nova preset also tends to assume a `data-state` variant convention for open/closed; that's already handled by Tailwind v4's built-in `data-[state=…]` selectors and does not need a custom variant. No extra work there.
- If at review time we find the section list has grown so large that the horizontal pill row wraps to 2+ lines ugly-ly, we revisit and consider the vertical-sidebar option. Not doing it now because the user's explicit preference is "fix the original horizontal design".
