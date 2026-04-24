# Implementation Plan: Backend API

## Overview

Adds a new `PickupModule` exposing one public endpoint (`GET /api/pickup-settings`) and five admin endpoints (`/api/admin/pickup-locations` CRUD + `/api/admin/pickup-settings` GET/PUT). Extends the existing `OrderModule` to accept and validate the three new pickup fields on order creation, persist them, and project them through admin order list / detail responses.

The validator (`PickupValidator`) is a pure TS module shared between the order-submit path and any future preview endpoint — keeping it pure makes the behavior easy to unit-test without the Nest DI wrappers.

## Files to Modify

### New files

- `backend/src/pickup/pickup.module.ts` — module, imports into `AppModule`
- `backend/src/pickup/pickup.controller.ts` — `GET /api/pickup-settings`
- `backend/src/pickup/pickup.service.ts` — data access to `pickup_locations` + `pickup_settings`
- `backend/src/pickup/pickup.validator.ts` — pure validator
- `backend/src/pickup/dto/create-pickup-location.dto.ts`
- `backend/src/pickup/dto/update-pickup-location.dto.ts`
- `backend/src/pickup/dto/update-pickup-settings.dto.ts`
- `backend/src/admin/pickup-admin.controller.ts` — admin endpoints (lives under `admin/` so `AdminAuthGuard` is available from `AdminModule`; registered in `admin.module.ts` alongside the other `*AdminController`s)
- `backend/src/pickup/pickup.validator.spec.ts`
- `backend/src/pickup/pickup.service.spec.ts`

### Modified files

- `backend/src/app.module.ts` — register `PickupModule`
- `backend/src/admin/admin.module.ts` — import `PickupModule`, register `PickupAdminController`
- `backend/src/order/dto/create-order.dto.ts` — add `pickup_method`, `pickup_location_id`, `pickup_at` with `class-validator` decorators
- `backend/src/order/order.module.ts` — import `PickupModule` so `OrderService` can inject `PickupService`
- `backend/src/order/order.service.ts` — call validator before insert, persist pickup fields, include in returned order payloads
- `backend/src/admin/order-admin.service.ts` — extend **both** `list()` (SELECT at ~line 38) and `detail()` (reads via `orderService.getOrderWithItems`) projections with pickup info
- `shared/src/types/pickup.ts` (**new**) — exported pickup types
- `shared/src/types/order.ts` — extend `Order`, `CreateOrderRequest` with pickup fields
- `shared/src/index.ts` — re-export pickup types

> **Architecture note — where does the admin controller live?** In this codebase, `AdminAuthGuard` is a provider of `AdminModule`, and every existing admin endpoint (`ContentAdminController`, `ProductAdminController`, …) sits inside `admin/` and is registered in `admin.module.ts`. Placing `PickupAdminController` there keeps the pattern consistent and avoids exporting the guard out of `AdminModule` just for one new file. The public `PickupController` plus `PickupService` still live in `pickup/`, and `AdminModule` imports `PickupModule` to pull `PickupService` into DI.

## Step-by-Step Implementation

### Step 1: Shared types

**File:** `shared/src/types/pickup.ts`

```ts
export type PickupMethod = 'in_person' | 'seven_eleven_frozen';

export interface PickupLocation {
  id: string;
  label_zh: string;
  label_en: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface PickupSettings {
  timeSlots: string[]; // ["15:00","20:00"]
  windowDays: number; // default 30
  leadDays: number; // default 2 — earliest bookable date = today + leadDays
  disabledWeekdays: number[]; // 0=Sun..6=Sat
  closureStartDate: string | null; // YYYY-MM-DD
  closureEndDate: string | null;
}

export interface PickupSettingsResponse extends PickupSettings {
  locations: PickupLocation[]; // active only for public endpoint
}

export interface CreatePickupLocationRequest {
  label_zh: string;
  label_en: string;
}

export interface UpdatePickupLocationRequest {
  label_zh?: string;
  label_en?: string;
  is_active?: boolean;
  sort_order?: number;
}

export interface UpdatePickupSettingsRequest extends PickupSettings {}
```

**File:** `shared/src/types/order.ts` — add to `Order` and `CreateOrderRequest`:

```ts
pickup_method: PickupMethod;
pickup_location_id: string;
pickup_at: string;             // ISO 8601
// admin-only projection:
pickup_location_label_zh?: string;
pickup_location_label_en?: string;
```

**File:** `shared/src/index.ts`

```ts
export * from './types/pickup';
```

**Rationale:** `shared` emits CommonJS; the admin frontend and customer frontend will both consume these types. Keep `timeSlots` camelCase on the wire to match the existing `CartResponse` / `AdminDashboardStats` convention (the raw DB column stays `time_slots`).

### Step 2: `PickupValidator` (pure module)

**File:** `backend/src/pickup/pickup.validator.ts`

```ts
import type { PickupLocation, PickupMethod, PickupSettings } from '@repo/shared';

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export interface TaipeiParts {
  y: number;
  m: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

export function taipeiParts(d: Date): TaipeiParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
    weekday: WEEKDAY_MAP[parts.weekday as string],
  };
}

export function ymdString(p: TaipeiParts): string {
  return `${p.y}-${pad(p.m)}-${pad(p.day)}`;
}

export function validatePickupAt(input: {
  method: PickupMethod;
  locationId: string;
  pickupAt: Date;
  now: Date;
  settings: PickupSettings;
  locations: Pick<PickupLocation, 'id' | 'is_active'>[];
}): ValidationResult {
  const { method, locationId, pickupAt, now, settings, locations } = input;

  if (method === 'seven_eleven_frozen') return { ok: false, reason: 'seven_eleven_not_available' };
  if (method !== 'in_person') return { ok: false, reason: 'unknown_pickup_method' };

  const location = locations.find((l) => l.id === locationId);
  if (!location || location.is_active === false)
    return { ok: false, reason: 'pickup_location_unavailable' };

  if (Number.isNaN(pickupAt.getTime())) return { ok: false, reason: 'invalid_pickup_at' };
  if (pickupAt.getTime() <= now.getTime()) return { ok: false, reason: 'pickup_in_past' };

  const nowParts = taipeiParts(now);
  const pickParts = taipeiParts(pickupAt);
  const nowYmd = ymdString(nowParts);
  const pickYmd = ymdString(pickParts);

  // windowEnd = "today Taipei + windowDays days", compared as YMD strings so the
  // entire last-day's 22:00 slot is included (fixes N1 off-by-one the review raised).
  const windowEndDate = new Date(Date.UTC(nowParts.y, nowParts.m - 1, nowParts.day));
  windowEndDate.setUTCDate(windowEndDate.getUTCDate() + settings.windowDays);
  const windowEndYmd = `${windowEndDate.getUTCFullYear()}-${pad(windowEndDate.getUTCMonth() + 1)}-${pad(windowEndDate.getUTCDate())}`;

  // Lead-days check: earliest bookable date = today + leadDays
  const leadDays = settings.leadDays ?? 0;
  const earliestDate = new Date(Date.UTC(nowParts.y, nowParts.m - 1, nowParts.day));
  earliestDate.setUTCDate(earliestDate.getUTCDate() + leadDays);
  const earliestYmd = `${earliestDate.getUTCFullYear()}-${pad(earliestDate.getUTCMonth() + 1)}-${pad(earliestDate.getUTCDate())}`;

  if (pickYmd < earliestYmd) return { ok: false, reason: 'pickup_in_past' };
  if (pickYmd > windowEndYmd) return { ok: false, reason: 'pickup_beyond_window' };

  if (settings.disabledWeekdays.includes(pickParts.weekday))
    return { ok: false, reason: 'weekday_closed' };

  if (
    settings.closureStartDate &&
    settings.closureEndDate &&
    pickYmd >= settings.closureStartDate &&
    pickYmd <= settings.closureEndDate
  )
    return { ok: false, reason: 'within_closure' };

  const hhmm = `${pad(pickParts.hour)}:${pad(pickParts.minute)}`;
  if (!settings.timeSlots.includes(hhmm)) return { ok: false, reason: 'time_slot_unavailable' };

  return { ok: true };
}
```

**Rationale:**

- Pure function — no Nest decorators, no DI, no Supabase. Fully unit-testable.
- `reason` codes are stable strings the controller layer maps to HTTP responses.
- **Why `Intl.DateTimeFormat` rather than a manual UTC-offset shift.** An earlier draft computed Taipei wall-clock with `d.getTime() + d.getTimezoneOffset() * 60_000 + 8*3600_000`, which silently drifts around DST on any host TZ that observes DST (e.g. dev on macOS in CEST). `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' })` asks the Intl library to do the tz conversion with IANA rules and returns the right parts on every host. Node 20+ ships Intl with full ICU by default, so no dependency. `date-fns-tz` was considered and rejected — correct behavior is already achievable with stdlib, and we'd be adding the dep only for this one call.
- Window bounds are compared as **YMD strings** on both sides so the last day's 22:00 slot is included (the prior `pickupAt.getTime() > now + windowDays*24h` check could reject the tail of the window).

### Step 3: `PickupService`

**File:** `backend/src/pickup/pickup.service.ts`

Inject `SupabaseService` (global). Three methods initially:

```ts
async getPublicSettings(): Promise<PickupSettingsResponse>
async getAdminSettings():  Promise<PickupSettingsResponse>   // includes inactive locations
async updateSettings(dto: UpdatePickupSettingsRequest, adminUserId: string): Promise<PickupSettings>

async listLocations(params?: { includeInactive?: boolean }): Promise<PickupLocation[]>
async createLocation(dto: CreatePickupLocationRequest): Promise<PickupLocation>
async updateLocation(id: string, dto: UpdatePickupLocationRequest): Promise<PickupLocation>
async softDeleteLocation(id: string): Promise<void>          // sets is_active=false
```

Plus the shared helper:

```ts
async loadValidationBundle(): Promise<{ settings: PickupSettings; locations: PickupLocation[] }>
```

which `OrderService` calls right before submit.

**Validation inside update paths (server-enforced, UI-friendly error messages):**

- `timeSlots`: each entry matches `/^(1[5-9]|2[0-2]):00$/`; array length ≥ 1. Enforced by the `@Matches` / `@ArrayMinSize` decorators on `UpdatePickupSettingsDto` (defence-in-depth at both DTO and service layers).
- `windowDays`: integer 1–365.
- `leadDays`: integer 0–30. Controls the earliest bookable date (`today + leadDays`). 0 = today, 2 = day after tomorrow (default).
- `disabledWeekdays`: unique integers in `[0..6]`.
- Closure range: either both null or both set and `end >= start`.
- `label_zh` / `label_en` trim + non-empty.

**Defensive guard — last active location.** `softDeleteLocation(id)` (and any `updateLocation` call that flips `is_active` to `false`) must refuse when the target is the **only remaining active row** in `pickup_locations`. Otherwise the customer cart page would render an empty location dropdown and no order could ever be placed. Implemented via a `SELECT id FROM pickup_locations WHERE is_active = true AND id <> :id` count — if zero, throw `BadRequestException('cannot_delete_last_active_location')`.

**Public-read narrowing for `pickup_settings.updated_by`.** `readSettings()` explicitly lists the six functional columns (`time_slots, window_days, lead_days, disabled_weekdays, closure_start_date, closure_end_date`) and never selects `updated_by`, so the public `GET /api/pickup-settings` cannot leak the admin's auth UUID. See the "RLS leakage note" in `database-schema.md` for context.

Throw `BadRequestException` with a user-readable message per violation.

**Rationale:** Keep the validation error strings human-readable because the admin frontend surfaces them in toasts; the validator's reason codes are for submit-path machine handling.

### Step 4: `PickupController` (public)

**File:** `backend/src/pickup/pickup.controller.ts`

```ts
@ApiTags('Pickup')
@Controller('api/pickup-settings')
export class PickupController {
  constructor(private readonly pickupService: PickupService) {}

  @Get()
  get() {
    return this.pickupService.getPublicSettings();
  }
}
```

No guard — this is public read. Do not expose inactive locations.

### Step 5: `PickupAdminController`

**File:** `backend/src/admin/pickup-admin.controller.ts`

```ts
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class PickupAdminController {
  constructor(private readonly pickupService: PickupService) {}

  @Get('pickup-settings') getSettings() {
    return this.pickupService.getAdminSettings();
  }
  @Put('pickup-settings') updateSettings(
    @Body() dto: UpdatePickupSettingsDto,
    @CurrentUser() u: { id: string },
  ) {
    return this.pickupService.updateSettings(dto, u.id);
  }

  @Get('pickup-locations') listLocations() {
    return this.pickupService.listLocations({ includeInactive: true });
  }
  @Post('pickup-locations') createLocation(@Body() dto: CreatePickupLocationDto) {
    return this.pickupService.createLocation(dto);
  }
  @Patch('pickup-locations/:id') updateLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePickupLocationDto,
  ) {
    return this.pickupService.updateLocation(id, dto);
  }
  @Delete('pickup-locations/:id')
  @HttpCode(204)
  async deleteLocation(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.pickupService.softDeleteLocation(id);
  }
}
```

**Rationale:** Mirrors the existing `ContentAdminController` style — `@ApiTags('Admin')` + `@ApiBearerAuth()` + `@UseGuards(AdminAuthGuard)` is the project convention for admin endpoints. `AdminAuthGuard` already populates `req.user`; `@CurrentUser()` reads it. `ParseUUIDPipe` on the id params gives an early 400 for malformed paths.

### Step 6: Wire `PickupModule` and register the admin controller

**File:** `backend/src/pickup/pickup.module.ts`

```ts
@Module({
  controllers: [PickupController],
  providers: [PickupService],
  exports: [PickupService],
})
export class PickupModule {}
```

**File:** `backend/src/app.module.ts` — add `PickupModule` to `imports`.

**File:** `backend/src/admin/admin.module.ts` — add `PickupModule` to `imports`, and add `PickupAdminController` to `controllers`. The admin controller gets `PickupService` via DI through the imported module, and `AdminAuthGuard` stays where it is.

### Step 7: Extend order create DTO

**File:** `backend/src/order/dto/create-order.dto.ts`

```ts
@IsIn(['in_person', 'seven_eleven_frozen'])
pickup_method: PickupMethod;

@IsUUID()
pickup_location_id: string;

@IsISO8601()
pickup_at: string;
```

**Rationale:** `class-validator` guards the shape; semantic validation (slot actually allowed) runs in the service via `PickupValidator` because it needs settings + locations.

### Step 8: Extend `OrderService.create()`

**File:** `backend/src/order/order.service.ts`

Inside the existing `create()` method, before the insert:

```ts
const bundle = await this.pickup.loadValidationBundle();
const result = validatePickupAt({
  method: dto.pickup_method,
  locationId: dto.pickup_location_id,
  pickupAt: new Date(dto.pickup_at),
  now: new Date(),
  settings: bundle.settings,
  locations: bundle.locations,
});
if (!result.ok) {
  throw new BadRequestException({
    code: 'pickup_slot_unavailable',
    reason: result.reason,
  });
}
```

Then include in the insert payload:

```ts
pickup_method:      dto.pickup_method,
pickup_location_id: dto.pickup_location_id,
pickup_at:          dto.pickup_at,
```

**Rationale:** Keeps all three columns NOT NULL-safe. Uses a structured error body so the customer FE can show a specific toast message.

### Step 9: Admin order projections

**File:** `backend/src/admin/order-admin.service.ts`

Two methods need updating, not one:

1. **`list()` SELECT (currently line ~38)** — the hand-rolled column list must gain `pickup_method, pickup_at, pickup_location:pickup_locations(label_zh, label_en)`. Without this the admin order list "取貨時間" column and location label will be blank.
2. **`detail()`** — this currently delegates to `OrderService.getOrderWithItems(orderId)` which already does `select('*, items:order_items(*)')`. `*` picks up the three new columns automatically, but the nested location label is not fetched. Two options:
   - (a) Extend `OrderService.getOrderWithItems` to always include the join — risks leaking the join into customer-facing endpoints unnecessarily.
   - (b) Add a dedicated `OrderAdminService.detailWithPickup()` that runs its own SELECT with the join.
     Choose (b) — keeps `OrderService` narrow and the admin path a single round-trip. The new method replaces the current `return this.orderService.getOrderWithItems(orderId)` line inside `detail()`.

Mapping shape: supabase-js returns the nested select as `pickup_location: { label_zh, label_en }`. Flatten in the service to `pickup_location_label_zh` / `pickup_location_label_en` before returning so the shared `Order` type (declared in `shared/src/types/order.ts`) matches.

**Rationale:** Admin order detail needs the location label for fulfillment. Two-method extension is explicit to prevent the "silently blank list column" trap that a single-method patch would leave behind.

### Step 10: Update `OrderModule`

**File:** `backend/src/order/order.module.ts`

Add `PickupModule` to the `imports`. `PickupService` is re-exported from `PickupModule`, so `OrderService` can inject it directly.

## Testing Steps

1. **Unit: validator**
   - `backend/src/pickup/pickup.validator.spec.ts` — table-driven specs covering each `reason` return value plus the happy path. No DB.
2. **Unit: service**
   - `backend/src/pickup/pickup.service.spec.ts` — mock `SupabaseService` via `createMock` pattern used in `auth.service.spec.ts`. Test the validation in `updateSettings` (invalid timeSlot, inverted closure, etc.) and the soft-delete on `softDeleteLocation`.
3. **E2E: order creation**
   - Extend `backend/test/order.e2e-spec.ts` with two new tests:
     - Happy: POST /api/orders with valid pickup fields returns 201 and the row persists.
     - Sad: POST with `pickup_at` in the past returns 400 with `code: 'pickup_slot_unavailable'`.
4. **Curl smoke** (after deploying):
   ```bash
   curl $API/api/pickup-settings | jq
   curl -H "Authorization: Bearer $ADMIN_JWT" $API/api/admin/pickup-locations | jq
   ```
5. **Admin order detail** — create an order in dev, open `/dashboard/orders/:id` in the admin FE, confirm the new fields render (after frontend tickets are implemented).

## Dependencies

- Depends on: `database-schema.md` (tables + columns must exist first).
- Must complete before: `customer-frontend.md` (cart page fetches `/api/pickup-settings`), `admin-frontend.md` (pickup-config page fetches admin endpoints).

## Notes

- `BadRequestException({code, reason})` produces `{"statusCode":400,"code":"pickup_slot_unavailable","reason":"..."}` — both frontends should key on `code` not free-text.
- Prefer `supabase.from('pickup_settings').update(...).eq('id', 1)` over upsert; the row always exists after seeding.
- If the `OrderAdminService` file name differs from `order.admin.service.ts` in this repo, adjust — the grep target is the class `OrderAdminService`.
- Do **not** throw on `seven_eleven_frozen` during `PickupService.loadValidationBundle` — the validator rejects it per-request so the public settings endpoint can still be called by the cart page when the user is flipping the dropdown.
