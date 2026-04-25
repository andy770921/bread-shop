# PRD: FEAT-10 — Pickup Method on Cart

## Problem Statement

Papa Bakery customers today place orders without specifying how or when they will receive the goods. The owner currently contacts buyers one-by-one over LINE to coordinate an in-person handover. This is slow and error-prone — pickup time gets dropped, duplicated, or double-booked. The shop needs the pickup method, location, and exact slot captured at order time so fulfillment can be planned from the order list.

## Solution Overview

Add a **Pickup** block on the `/cart` page that forces the customer to pick:

1. **Pickup method** — dropdown with `面交` (in-person) and `7-11 冷凍取貨` (seven-eleven frozen). The 7-11 option is visible but renders a "擴展中" notice; it cannot be used to place an order yet.
2. **Pickup location** — dropdown of admin-configured locations (seeded with the two Hsinchu points).
3. **Pickup time** — date picker (react-day-picker inside a popover) plus a radio group of time-of-day slots. Date is constrained by a rolling window, always-closed weekdays, and an optional admin-set closure range. Time slots are admin-configured (any subset of the 15:00–22:00 grid in 30-minute increments — `15:00, 15:30, …, 21:30, 22:00`, 15 slots in total).

All three values are **required** to enable the place-order button. The submit payload adds `pickup_method`, `pickup_location_id`, and a single `pickup_at` TIMESTAMPTZ. The backend re-validates against current settings and rejects 400 if the slot is no longer valid.

A new **top-level admin sidebar tab "取貨設定"** lets the owner manage locations and time settings without a code change. New user-facing strings go in `i18n/zh.json` + `en.json` so they are also editable from the existing site-content editor.

## User Stories

1. As a **customer**, I want to pick my pickup method, location, and time on the cart page, so I know exactly when and where to collect my order before I submit it.
2. As a **customer**, I want the calendar to hide dates the shop is closed on, so I don't waste a click on an invalid slot.
3. As a **customer**, if I picked a slot that has since been closed by the owner, I want to see a clear toast explaining that and be allowed to pick another slot.
4. As the **shop owner**, I want to add, rename, and retire pickup locations without needing a developer.
5. As the **shop owner**, I want to choose which 30-minute slots between 15:00 and 22:00 and which weekdays are bookable, plus block an arbitrary date range for vacations.
6. As the **shop owner**, I want to configure how many days ahead the calendar opens (default 30) so I can keep the booking horizon short during busy periods.
6b. As the **shop owner**, I want to configure a lead-time buffer (default 2 days) so that customers can only book starting from the day after tomorrow, giving me preparation time.
7. As the **shop owner**, I want every order in the admin order detail to show pickup method, location, and the exact timestamp so I can plan daily fulfillment.

## Implementation Decisions

### Modules

**Backend — new `PickupModule`** (`backend/src/pickup/`)

- `PickupController` — `GET /api/pickup-settings` (public, for cart page).
- `PickupService` — reads/writes `pickup_locations` and `pickup_settings` tables, exposes a `loadValidationBundle()` helper consumed by `OrderService` and the `validatePickupAt` pure function.
- `PickupValidator` — pure function module that takes a settings snapshot + desired `pickup_at` and decides accept/reject. Kept separate so the unit test footprint is small and both the public-facing preview and the order-submit path can share the rule set. Uses `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })` to derive Taipei wall-clock parts — DST-safe on every host TZ, no date library dependency.
- `PickupAdminController` (lives in `backend/src/admin/pickup-admin.controller.ts`) — admin CRUD on locations + settings under `/api/admin/pickup-*`, guarded by the existing `AdminAuthGuard`. Registered in `AdminModule`; `AdminModule` imports `PickupModule` to reuse `PickupService`. Keeping admin controllers inside `admin/` mirrors `ContentAdminController`, `ProductAdminController`, etc.

**Backend — `OrderModule` changes**

- `CreateOrderDto` gains `pickup_method`, `pickup_location_id`, `pickup_at`.
- `OrderService.create()` calls `PickupService.validatePickupAt()` before writing, and persists the three columns on `orders`.
- `OrderAdminService` list/detail projections include the three new fields plus the location label for display.

**Customer frontend — `PickupSection` feature** (`frontend/src/features/pickup/`)

- `PickupSection.tsx` — renders the three inputs, consumes `usePickupSettings()` query.
- `PickupDatePicker.tsx` — popover wrapping `react-day-picker` with a `disabled` matcher built from the settings (past dates, beyond-window, weekday blackouts, closure range).
- `usePickupSettings.ts` — TanStack query hook against `GET /api/pickup-settings`.
- Cart form Zod schema extended; `use-checkout-flow` passes new fields through.

**Admin frontend — `PickupConfig` route** (`admin-frontend/src/routes/dashboard/pickup-config/`)

- `PickupConfigPage.tsx` — two-section layout: `LocationManager` + `ScheduleSettings`.
- `LocationManager.tsx` — add / rename / soft-delete, `react-hook-form` + mutation hooks.
- `ScheduleSettings.tsx` — time-slot checkbox grid (15:00–22:00 in 30-minute increments, 15 slots), weekday blackout checkboxes (Mon–Sun), closure date-range picker, window-days text input, lead-days text input.
- `queries/usePickupConfig.ts` — fetch/mutation hooks mirroring `useSiteContent`.

**Shared** (`shared/src/types/pickup.ts`)

- `PickupMethod`, `PickupLocation`, `PickupSettings`, `PickupSettingsResponse`, `CreatePickupLocationRequest`, `UpdatePickupLocationRequest`, `UpdatePickupSettingsRequest`.

### Architecture

- **Data model.** Two new tables plus three columns on `orders`. Locations are a real table (referenced by `orders.pickup_location_id` with FK). Settings are a single `pickup_settings` singleton row (`id = 1`) because every field is shop-global; this avoids the key/value shape of `site_content` which would be clunky for typed arrays.
- **Storage of pickup time.** Single `pickup_at TIMESTAMPTZ` column. The UI composes this from `date + time_slot` in Asia/Taipei, converts to ISO before submit, and the BE validates that the timestamp's local hour is in the admin-configured slot list. This keeps queries (e.g. "orders pickup-ing tomorrow") a simple range scan.
- **Validation locus.** The `PickupValidator` is the single source of truth. The frontend calendar's `disabled` matcher and the BE submit check both derive from the same settings payload; the FE disables what it can, the BE re-checks at submit for race-safety.
- **Seed + migration.** Existing orders get backfilled via Supabase MCP with `pickup_method='in_person'`, `pickup_location_id=<荷蘭村 id>`, `pickup_at` = today @ 15:00 Taipei, before the NOT NULL constraint is applied. This keeps the three columns strictly NOT NULL going forward. The backfill SQL must be parenthesised — see `database-schema.md` Step 5 — otherwise `AT TIME ZONE` binds before `+ interval '15 hours'` and the stored value is wrong.
- **Last-active-location guard.** `PickupService.softDeleteLocation()` refuses to disable the final active row in `pickup_locations` — without this, the customer cart dropdown could become unfillable.
- **Race safety.** The validator runs on every submit, so admin blackouts applied after a user has selected a date invalidate that selection with a 400 `code: 'pickup_slot_unavailable'` response. FE maps it to a toast and invalidates the settings cache.
- **7-11 option.** Accepted in the enum so the UI can show it, but the BE rejects it with 400 until phase 2. No plumbing for 7-11 delivery exists yet.
- **i18n + site-content.** New strings live in `frontend/src/i18n/{zh,en}.json` under a `cart.pickup.*` namespace. Because `admin-frontend/src/lib/content-keys.ts` flattens that JSON tree, the keys appear automatically in the existing content editor — no extra registration.

### APIs/Interfaces

**Public**

```
GET /api/pickup-settings            # cart page reads this
→ {
    locations: [{ id, label_zh, label_en }],
    timeSlots: ["15:00", "15:30", "20:00"],
    windowDays: 30,
    leadDays: 2,                         # earliest bookable date = today + leadDays
    disabledWeekdays: [0],               # 0=Sun ... 6=Sat (JS Date.getDay)
    closureStartDate: "2026-05-10" | null,
    closureEndDate:   "2026-05-14" | null,
  }
```

**Admin**

```
GET    /api/admin/pickup-locations
POST   /api/admin/pickup-locations          { label_zh, label_en }
PATCH  /api/admin/pickup-locations/:id      { label_zh?, label_en?, is_active? }
DELETE /api/admin/pickup-locations/:id      # soft delete (is_active=false)

GET    /api/admin/pickup-settings
PUT    /api/admin/pickup-settings           { timeSlots, windowDays, leadDays,
                                              disabledWeekdays,
                                              closureStartDate, closureEndDate }
```

**Order submit change**

```
POST /api/orders  body adds:
  pickup_method:      "in_person" | "seven_eleven_frozen"
  pickup_location_id: uuid
  pickup_at:          ISO8601 (e.g. "2026-05-10T15:00:00+08:00")

Rejects 400 "pickup_slot_unavailable" if validator fails.
```

## Testing Strategy

- **Backend unit** — `PickupValidator` spec covering: past date, beyond window, weekday blackout, inside closure range, non-enumerated hour, inactive location, unknown location, seven-eleven method rejection.
- **Backend integration** — `order.controller.e2e-spec.ts` creates an order end-to-end with valid pickup fields and asserts BD columns. Second test submits a now-invalid slot and asserts 400.
- **Frontend unit** — `PickupDatePicker.test.tsx` verifies the `disabled` matcher composition (jest, already configured).
- **Admin unit** — `ScheduleSettings.test.tsx` verifies checkbox ↔ array round-trip and window-days numeric coercion.
- **Manual QA checklist** — in `documents/FEAT-10/development/qa-checklist.md` (written alongside the implementation) — covers the "user picked a slot, admin blacked it out, user submits" race path.

## Out of Scope

- Actual 7-11 cold-chain integration. The enum entry exists only to display the "擴展中" notice.
- Multiple overlapping closure windows. Only a single `(start, end)` closure range is modelled; if more are needed we promote `closure_ranges` to its own table in a future ticket.
- Per-location independent schedules. All locations share the same time-slot / weekday / closure configuration.
- Customer-side notifications when an admin closes a previously-selected slot. User sees the rejection at submit time via toast; no proactive push.
- SMS / LINE reminders tied to `pickup_at`. Out of scope — this PRD only captures the value.
- Changing pickup after submit. Once placed, customer cannot edit pickup details (admin can via order detail edit — deferred to a later ticket).

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
