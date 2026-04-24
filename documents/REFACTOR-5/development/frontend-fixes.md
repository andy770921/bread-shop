# Implementation Plan: Frontend Fixes

## Overview

Two customer-frontend changes:

1. **Calendar `today` in Asia/Taipei.** `PickupDatePicker` builds its bounds from `startOfToday()`, which uses the browser's local timezone. The backend validator uses `Intl.DateTimeFormat('Asia/Taipei')`. A user whose browser clock sits west of Taipei (the Americas, most of Europe) can pick a date that is "today or future" locally but already "past or out of window" in Taipei — the submit then 400s even though the UI said the date was valid. Fix: compute `today` from Taipei wall-clock using the same Intl machinery the backend uses, and share a tiny helper via `pickup-schema.ts`.
2. **Filter elapsed time slots when the selected date is today.** `PickupTimeSlotRadio` always receives the full admin-configured list. When `pickup.date` is today Taipei and `now` is already past `15:00`, the user can still click `15:00` and only discovers the problem on submit. Fix: in `PickupSection`, pass a pre-filtered `slots` prop — only slots strictly after the current Taipei hour+minute when the date is today. When the filtered list is empty, the component renders a "no slots available today, please pick another date" hint and, as a UX follow-through, the date picker's `disabled` matcher also excludes today.

Optionally (Step 3), widen `extractCheckoutErrorMessage` so the new BE `message` field surfaces cleanly in toasts.

## Files to Modify

### Frontend Changes

- `frontend/src/features/pickup/pickup-schema.ts`
  - Add and export `taipeiToday()` and `taipeiNowParts()`.
  - Purpose: one source of truth for Taipei wall-clock on the FE; mirrors backend `taipeiParts()`.
- `frontend/src/features/pickup/PickupDatePicker.tsx`
  - Replace `startOfToday()` with `taipeiToday()`; pass a `slotsForDate` callback (or derived value) so the component can disable today when no future slots remain.
  - Purpose: calendar bounds match the backend validator.
- `frontend/src/features/pickup/PickupSection.tsx`
  - Compute `availableSlots` by filtering `data.timeSlots` against `pickup.date` and Taipei now.
  - Render a fallback hint when `availableSlots` is empty and the selected date is today.
  - Purpose: prevent the customer from picking an already-passed hour.
- `frontend/src/features/checkout/use-checkout-flow.ts` _(optional but recommended)_
  - Extend the existing toast mapping so `err.message` / `body.message` shows when `code === 'pickup_slot_unavailable'` and no `reason`-specific i18n key exists.
  - Purpose: leverage the new BE `message` field instead of the generic fallback.

### Tests (new)

- `frontend/src/features/pickup/pickup-schema.spec.ts`
  - `taipeiToday()` returns the correct Taipei date for fixed UTC inputs.
- `frontend/src/features/pickup/filter-slots.spec.ts` _(or inline in `PickupSection.spec.tsx`)_
  - Given fixed `now` and `date`, assert the filter keeps / drops the expected slots.

## Step-by-Step Implementation

### Step 1: `taipeiToday()` + `taipeiNowParts()` in `pickup-schema.ts`

**File:** `frontend/src/features/pickup/pickup-schema.ts`

**Changes:**

Append, below `composePickupAt`:

```ts
interface TaipeiWallClockParts {
  y: number;
  m: number;
  day: number;
  hour: number;
  minute: number;
}

export function taipeiNowParts(now: Date = new Date()): TaipeiWallClockParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
  };
}

/**
 * Returns a Date whose local fields represent midnight of today in Asia/Taipei.
 * Use this for react-day-picker bounds so the calendar matches the backend validator.
 */
export function taipeiToday(now: Date = new Date()): Date {
  const { y, m, day } = taipeiNowParts(now);
  return new Date(y, m - 1, day, 0, 0, 0, 0);
}
```

**Rationale:** Keep both helpers together because the slot-filter in Step 4 will reuse `taipeiNowParts` directly (it needs the current Taipei hour+minute). Exporting two narrow functions avoids future callers having to re-parse the Intl output.

### Step 2: Unit-test `taipeiToday`

**File:** `frontend/src/features/pickup/pickup-schema.spec.ts` _(new)_

**Changes:**

```ts
import { taipeiNowParts, taipeiToday } from './pickup-schema';

describe('[pickup-schema] taipeiNowParts', () => {
  it('returns Taipei wall-clock parts for a UTC instant', () => {
    // 2026-04-30 07:30 UTC = 2026-04-30 15:30 Taipei
    const parts = taipeiNowParts(new Date('2026-04-30T07:30:00Z'));
    expect(parts).toEqual({ y: 2026, m: 4, day: 30, hour: 15, minute: 30 });
  });

  it('crosses the date boundary correctly', () => {
    // 2026-04-30 17:00 UTC = 2026-05-01 01:00 Taipei
    const parts = taipeiNowParts(new Date('2026-04-30T17:00:00Z'));
    expect(parts).toMatchObject({ y: 2026, m: 5, day: 1, hour: 1 });
  });
});

describe('[pickup-schema] taipeiToday', () => {
  it('returns midnight of the Taipei date', () => {
    const d = taipeiToday(new Date('2026-04-30T07:30:00Z')); // Taipei 2026-04-30 15:30
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April = 3
    expect(d.getDate()).toBe(30);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});
```

**Rationale:** Two representative inputs cover the same-day and next-day-in-Taipei cases. Jest runs in UTC by default on the repo's CI; the helper must not depend on the host TZ.

### Step 3: Swap `startOfToday()` → `taipeiToday()` in `PickupDatePicker`

**File:** `frontend/src/features/pickup/PickupDatePicker.tsx`

**Changes:**

Replace the import:

```ts
import { addDays, format, parseISO } from 'date-fns';
```

…and the `today` line (around line 19):

```ts
import { taipeiToday } from './pickup-schema';

…

const today = taipeiToday();
```

Drop the `startOfToday` import. Everything else (`disabled` array, `startMonth`, `endMonth`) stays the same because `today` is a normal `Date`.

**Rationale:** Smallest possible change to match the backend. All downstream math (`addDays(today, windowDays)`, matcher shapes) already works on a plain `Date`.

### Step 4: Filter elapsed slots in `PickupSection`

**File:** `frontend/src/features/pickup/PickupSection.tsx`

**Changes:**

Above the JSX returning `PickupTimeSlotRadio`, add:

```tsx
import { taipeiNowParts } from './pickup-schema';

…

const selectedDate = form.watch('pickup.date');

const availableSlots = (() => {
  if (!selectedDate || method !== 'in_person') return data.timeSlots;
  const today = taipeiNowParts();
  const sameDay =
    selectedDate.getFullYear() === today.y &&
    selectedDate.getMonth() + 1 === today.m &&
    selectedDate.getDate() === today.day;
  if (!sameDay) return data.timeSlots;

  return data.timeSlots.filter((slot) => {
    const [h, m] = slot.split(':').map(Number);
    return h > today.hour || (h === today.hour && m > today.minute);
  });
})();
```

Pass `availableSlots` to `PickupTimeSlotRadio`:

```tsx
<PickupTimeSlotRadio slots={availableSlots} />
```

When `availableSlots.length === 0`, render an empty-state hint **below** the date picker (not replacing the radio group) so the user knows why the radio is empty:

```tsx
{
  method === 'in_person' && availableSlots.length === 0 && selectedDate && (
    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
      {t('cart.pickup.noSlotsToday')}
    </p>
  );
}
```

If the selected date currently held in form state is today and `availableSlots` is empty after filtering, clear the time slot from the form to force re-selection:

```tsx
useEffect(() => {
  if (availableSlots.length === 0) {
    form.setValue('pickup.timeSlot', undefined, { shouldValidate: true });
  }
}, [availableSlots.length, form]);
```

**Rationale:** Keeps the component declarative — the filter is a pure function of `data.timeSlots + selectedDate + taipeiNowParts()`. Clearing the stored slot when none are valid stops the `isValid` flag lingering on a stale value. The empty-state copy is a new i18n key; fallback to the key name while an actual string is added.

### Step 5: Add i18n keys

**File:** `shared/src/i18n/zh.json` and `shared/src/i18n/en.json`

**Changes:**

Inside `cart.pickup`, add `noSlotsToday`:

- `zh.json` → `"noSlotsToday": "今日時段皆已過，請選擇其他日期"`
- `en.json` → `"noSlotsToday": "All slots for today have passed. Please pick another date."`

**Rationale:** Mirrors the existing FEAT-10 i18n pattern. Keys flow into the admin content editor automatically via `content-keys.ts`.

### Step 6: Unit-test the slot filter

**File:** `frontend/src/features/pickup/filter-slots.spec.ts` _(new — easiest if we extract the filter into a pure function; otherwise spec it indirectly via `PickupSection.spec.tsx`)_

**Changes (preferred extraction):**

Move the `availableSlots` IIFE into an exported helper:

```ts
// pickup-schema.ts (additional export)
export function filterFutureSlots(
  slots: string[],
  date: Date | undefined,
  now: Date = new Date(),
): string[] {
  if (!date) return slots;
  const today = taipeiNowParts(now);
  const sameDay =
    date.getFullYear() === today.y &&
    date.getMonth() + 1 === today.m &&
    date.getDate() === today.day;
  if (!sameDay) return slots;
  return slots.filter((slot) => {
    const [h, m] = slot.split(':').map(Number);
    return h > today.hour || (h === today.hour && m > today.minute);
  });
}
```

Then in `PickupSection.tsx`:

```tsx
const availableSlots = filterFutureSlots(data.timeSlots, selectedDate);
```

Spec:

```ts
import { filterFutureSlots } from './pickup-schema';

describe('[pickup] filterFutureSlots', () => {
  const slots = ['15:00', '20:00'];

  it('returns all slots when date is not selected', () => {
    expect(filterFutureSlots(slots, undefined)).toEqual(slots);
  });

  it('returns all slots when the selected date is not today', () => {
    // now = 2026-04-30 10:00 Taipei; selected = tomorrow Taipei
    const now = new Date('2026-04-30T02:00:00Z');
    const tomorrow = new Date(2026, 4, 1); // Taipei 2026-05-01 local to test runner
    expect(filterFutureSlots(slots, tomorrow, now)).toEqual(slots);
  });

  it('drops slots that have already passed today', () => {
    // now = 2026-04-30 19:00 Taipei → only 20:00 remains
    const now = new Date('2026-04-30T11:00:00Z');
    const today = new Date(2026, 3, 30); // Taipei 2026-04-30
    expect(filterFutureSlots(slots, today, now)).toEqual(['20:00']);
  });

  it('returns empty when all slots are past', () => {
    // now = 2026-04-30 21:00 Taipei
    const now = new Date('2026-04-30T13:00:00Z');
    const today = new Date(2026, 3, 30);
    expect(filterFutureSlots(slots, today, now)).toEqual([]);
  });
});
```

**Rationale:** The filter has 4 easily-specified branches and zero framework dependencies — much cheaper to lock in with a pure function than via RTL render tests. `Date` constructed with local-integer args matches how `react-day-picker` hands dates to `onSelect`.

### Step 7 _(optional)_: Surface the new BE `message` in checkout toasts

**File:** `frontend/src/features/checkout/use-checkout-flow.ts`

**Changes:**

Inside `extractCheckoutErrorMessage`, prefer `body.message` over the existing `body.message` array branch. If `err.body?.code === 'pickup_slot_unavailable'` and the localized `cart.pickup.errors.${reason}` key exists, translate it; otherwise fall back to `body.message`.

**Rationale:** Leverages the richer backend payload without regressing any existing handlers. If the backend change (`backend-fixes.md`) has not shipped yet, the `??` fallback still yields the same behavior as today.

## Testing Steps

1. `cd frontend && npx jest src/features/pickup` — all three new specs green.
2. `cd frontend && npx jest` — full suite green (44 existing + 3–6 new).
3. `npm run lint` at the root — green.
4. Manual Playwright smoke:
   - DevTools → Sensors → override timezone to `America/Los_Angeles`; open `/cart` while Taipei clock is 00:30; calendar's first enabled day is today in Taipei, not yesterday LA.
   - Set `pickup_settings.time_slots = ['15:00','20:00']` and wait until Taipei time is after 20:00; open cart, pick today in the calendar → slot radio shows no options and the "all slots have passed" hint appears.
   - Admin UI: rename a location to `" "` → error toast surfaces, list reverts.
   - Race path: customer picks today 20:00; admin sets closure on today → customer submits → toast text matches the localized `time_slot_unavailable` copy (or, if not localized, the BE `message` string).

## Dependencies

- Must complete after: `backend-fixes.md` Step 1–2 (so Step 7 has the new `message` field to read from; Steps 1–6 are independent of the backend changes).
- Independent of: each other — Steps 3 and Steps 4–6 can ship in separate PRs if desired.

## Notes

- `taipeiToday()` and `taipeiNowParts()` intentionally live next to `composePickupAt` in `pickup-schema.ts` rather than in `frontend/src/lib/` — they are feature-local and should not be mined by unrelated UI code.
- `filterFutureSlots` leaves the "no slots today" state to the UI layer to communicate; it does not, itself, push today into the `disabled` matcher. That is a deliberate separation — if a later PM decision is "close today entirely when no slots remain," gate that behavior with an explicit `disableEmptyDays` prop rather than making the filter silently affect the date picker.
- react-day-picker's `onSelect` hands back a plain `Date` constructed with the user's local fields as calendar ints (`new Date(year, month, day)`). That means comparing the picker's date to `taipeiNowParts()` by `(y, m, day)` triples is safe regardless of host TZ. Do not compare via `getTime()`.
