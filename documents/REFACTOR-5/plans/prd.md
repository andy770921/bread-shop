# PRD: REFACTOR-5 — Pickup Flow Validation Consistency Fixes

## Problem Statement

A Codex review of FEAT-10 (Pickup Method on Cart) surfaced four P2 issues where the frontend and backend disagree about what is a valid pickup submission, or where the backend silently accepts malformed admin input. Each one manifests as a user-visible bug:

- A customer who loses a race against an admin closure sees a generic “checkout failed” toast instead of “pick another slot,” because the structured 400 body is dropped on its way to the UI.
- A customer whose browser clock is in a timezone west of Taipei can pick a date that the backend will then reject as past or out-of-window.
- An admin can accidentally blank out a pickup location by saving a whitespace-only label, which then surfaces as an empty `<option>` in the customer cart.
- A customer who opens the cart after 3 p.m. Taipei time can still select the 15:00 slot for today; the backend only rejects it on submit.

All four are internal to the FEAT-10 pickup module — no new product surface is needed. The refactor makes the frontend and backend validators consistent and removes the whitespace-label footgun on the admin side.

## Solution Overview

Four focused patches, two on the backend and two on the customer frontend:

1. **Structured submit-error that still carries a readable `message`.** `OrderService.createOrder()` wraps the validator result in a `BadRequestException` whose payload is a plain object `{ code, reason }`. Nest serializes that object as the response body but leaves `err.message` as `"Bad Request Exception"`, so FE `err.message` / `body.message` handlers fall back to a generic string. Fix: include a human-readable `message` field in the thrown payload and map specific `reason` codes to localized copy on the customer FE’s checkout-error extractor.
2. **Taipei-local wall-clock in the date picker.** `PickupDatePicker` builds `today` from `startOfToday()` (browser timezone) and uses it as the `{ before: today }` matcher plus the `startMonth`/`endMonth` bounds. Fix: derive the picker’s `today` using `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })` — the same mechanism the backend validator uses — so the calendar matches what `validatePickupAt()` will accept.
3. **Reject blank pickup-location labels after trim.** `PickupService.updateLocation()` trims `label_zh` / `label_en` before writing but does not reject a post-trim empty string. `class-validator`’s `@MinLength(1)` on the DTO runs against the raw input, which lets `" "` through. Fix: mirror `createLocation()` — after trimming, throw `BadRequestException('label_required')` if either label is empty. Same guard applies to rename writes on the same endpoint.
4. **Filter elapsed slots on today.** `PickupTimeSlotRadio` always renders every admin-configured slot. When the selected date is today Taipei, past-hour slots need to be filtered; when all configured slots for today are already past, today itself should be disabled in the calendar (or the radio shows a “no slots today, please pick another date” state).

## User Stories

1. As a **customer**, when an admin has just closed a slot I had selected, I want the toast to tell me the slot is no longer available, so I know to re-pick rather than thinking checkout broke.
2. As a **customer** on a browser clock set to a non-Taiwan timezone, I want the calendar to only show me dates the shop will accept, so I don’t hit a 400 I can’t diagnose.
3. As a **customer** opening the cart late in the day, I want the time-slot chooser to hide hours that have already passed today, so I don’t pick `15:00` at 18:00 and get a confusing error.
4. As the **shop owner**, I want the admin pickup-config to reject an empty location name rather than saving whitespace, so I can’t silently break the customer dropdown.

## Implementation Decisions

### Modules

All changes live inside FEAT-10 code paths. No new modules.

- **`backend/src/order/order.service.ts`** — widen the 400 payload on pickup-validator failure; keep `code` and `reason` for FE machine handling, add `message` for FE string-based extractors.
- **`backend/src/pickup/pickup.service.ts`** — tighten `updateLocation()` label validation to match `createLocation()`.
- **`frontend/src/features/pickup/PickupDatePicker.tsx`** — compute `today` in Asia/Taipei; export a small `taipeiToday()` helper.
- **`frontend/src/features/pickup/PickupSection.tsx`** (or a sibling `filter-slots.ts`) — pass a filtered `slots` prop to `PickupTimeSlotRadio` when the selected date is today.
- **`frontend/src/features/checkout/use-checkout-flow.ts`** (optional, minor) — surface the new `message` field via `extractCheckoutErrorMessage()` so the toast shows the specific reason.

### Architecture

- **Single source of Taipei-time truth.** A new tiny helper `taipeiToday()` in `frontend/src/features/pickup/pickup-schema.ts` (beside `composePickupAt`) returns a `Date` whose local fields read as Taipei midnight-today. Both `PickupDatePicker` and the today-slot filter consume it. This keeps the rule in one place and matches the backend’s `taipeiParts()`.
- **Structured error body, graceful fallback.** The BE DTO throws an object with at minimum `{ code, reason, message }`. FE keyed error handling keys on `code`; legacy string-extractors read `message`. Backwards-compatible.
- **Admin label invariants close to the DB.** Trim-then-reject at the service boundary, not in the DTO, because `class-validator` doesn’t trim before validating. Mirrors the create path exactly — no drift.

### APIs/Interfaces

No new endpoints; one backward-compatible response shape change.

```
POST /api/orders                                         // 400 on pickup race
body →  {
  statusCode: 400,
  code:     "pickup_slot_unavailable",
  reason:   "pickup_in_past" | "time_slot_unavailable" | "weekday_closed" | …,
  message:  "The selected pickup slot is no longer available. Please pick another slot."
}

PATCH /api/admin/pickup-locations/:id                    // 400 on blank label
body →  { code: "label_required", message: "Label cannot be empty." }
```

## Testing Strategy

- **Backend unit (Jest):**
  - Extend `order.service.spec.ts` with a “pickup race” test that stubs the validator as failing and asserts the thrown exception’s `getResponse()` has `code`, `reason`, and a non-empty `message`.
  - Extend `pickup.service.spec.ts` with two cases: `updateLocation({ label_zh: "   " })` throws `BadRequestException('label_required')`; `updateLocation({ label_en: " Holland  " })` normalizes to `"Holland"`.
- **Frontend unit (Jest):**
  - New `pickup-schema.spec.ts` asserts `taipeiToday()` returns the Taipei date for fixed UTC inputs (e.g. 2026-04-30 15:30 UTC → Taipei 2026-04-30; 2026-04-30 17:00 UTC → Taipei 2026-05-01).
  - New `filter-slots.spec.ts` asserts that given `slots=['15:00','20:00']` + `date=today` + `now=19:00 Taipei`, only `['20:00']` is returned; when `now=21:00 Taipei`, returns `[]` (empty → component renders "no slots today").
- **Admin Vitest:** none new; LocationManager already round-trips the PATCH response.
- **Manual Playwright smoke (post-implementation):**
  - Cart race path: start a cart with a selected date; in another tab, admin sets a closure over that date; back to cart, submit → toast shows the specific slot-unavailable message (from `message`, not generic).
  - Timezone test: set browser dev tools timezone to `America/Los_Angeles`, open cart at Taipei 00:30 → calendar’s earliest-selectable day is today Taipei (= yesterday LA), not today LA.
  - Today-elapsed test: with `pickup_settings.time_slots = ['15:00','20:00']` and current Taipei hour = 21, open cart; picking today should show no slots (or today is disabled).
  - Admin blank-label: PATCH `label_zh: "   "` via the UI rename → sees error toast, record unchanged.

## Out of Scope

- Changing the set of validator `reason` codes or adding new ones.
- Localizing the new BE `message` field into zh / en on the server (keep it English; FE i18n maps `reason` → localized string as today).
- Adding per-location schedules or multi-closure windows — still the FEAT-10 singleton model.
- Prefilling pickup across sessions via `CartContactDraft` (explicitly rejected in FEAT-10 scope; stays out).
- Backfilling old orders whose stored `pickup_at` fell outside the new-window semantics — none today.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
