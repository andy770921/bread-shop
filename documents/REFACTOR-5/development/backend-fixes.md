# Implementation Plan: Backend Fixes

## Overview

Two backend changes:

1. **Richer 400 payload on pickup-validator failure.** `OrderService.createOrder()` currently throws `BadRequestException({ code, reason })`; Nest serializes that as the response body but leaves `err.message` as `"Bad Request Exception"`. The customer FE extracts errors as strings, so race-loss toasts surface as a generic failure. Add a human-readable `message` field so FE string-based extractors get something useful without dropping the structured `code`/`reason` used by machine handlers.
2. **Admin pickup-location label trim-then-reject.** `PickupService.updateLocation()` trims `label_zh` / `label_en` before writing, but `class-validator`’s `@MinLength(1)` on the DTO runs pre-trim — so a payload like `{ "label_zh": "   " }` passes DTO validation and saves as `""`. Mirror the behavior already present in `PickupService.createLocation()`: throw `BadRequestException('label_required')` when any updated label is empty after `trim()`.

## Files to Modify

### Backend Changes

- `backend/src/order/order.service.ts`
  - Modify the `validatePickupAt` failure branch inside `createOrder()` to include `message` (plus preserve `code` and `reason`).
  - Purpose: restore human-readable messages for FE toasts on pickup race-loss.
- `backend/src/pickup/pickup.service.ts`
  - Modify `updateLocation()` to compute `trimmedZh` / `trimmedEn` and reject when the caller is explicitly setting an empty post-trim value.
  - Purpose: prevent admin from saving whitespace-only location labels.
- `backend/src/pickup/pickup.service.spec.ts` (new if missing; otherwise extend)
  - Add cases for blank-after-trim and whitespace-padded labels.
  - Purpose: lock in the new invariant.
- `backend/src/order/order.service.spec.ts`
  - Add a "pickup-race 400 carries code + reason + message" case covering the new exception shape.
  - Purpose: lock in the richer error body.

### Shared Types

- None. The 400 body change is additive (new optional `message` field); shared types for API responses are untyped `unknown` today.

## Step-by-Step Implementation

### Step 1: Add a reason → message map in `order.service.ts`

**File:** `backend/src/order/order.service.ts`

**Changes:**

Add, near the top of the file (after imports):

```ts
const PICKUP_REASON_MESSAGES: Record<string, string> = {
  seven_eleven_not_available:
    'Seven-Eleven frozen pickup is not yet available. Please choose in-person pickup.',
  unknown_pickup_method: 'Unsupported pickup method.',
  pickup_location_unavailable: 'The selected pickup location is no longer available.',
  invalid_pickup_at: 'Invalid pickup time.',
  pickup_in_past: 'The selected pickup time has already passed.',
  pickup_beyond_window: 'The selected pickup date is outside the booking window.',
  weekday_closed: 'The shop is closed on the selected weekday.',
  within_closure: 'The shop is closed during the selected date range.',
  time_slot_unavailable: 'The selected time slot is no longer offered.',
};

function pickupReasonMessage(reason: string): string {
  return (
    PICKUP_REASON_MESSAGES[reason] ??
    'The selected pickup slot is no longer available. Please pick another slot.'
  );
}
```

**Rationale:** Keep the message table local — it is consumed only here, and the reasons are defined in `pickup.validator.ts`. This mirrors the repo's pattern of keeping tightly-coupled constants alongside their one caller.

### Step 2: Include `message` in the thrown `BadRequestException`

**File:** `backend/src/order/order.service.ts`

**Changes:**

Locate the existing block (around line 80):

```ts
if (!pickupResult.ok) {
  throw new BadRequestException({
    code: 'pickup_slot_unavailable',
    reason: pickupResult.reason,
  });
}
```

Replace with:

```ts
if (!pickupResult.ok) {
  throw new BadRequestException({
    code: 'pickup_slot_unavailable',
    reason: pickupResult.reason,
    message: pickupReasonMessage(pickupResult.reason),
  });
}
```

**Rationale:** `BadRequestException({ message, … })` makes Nest populate both `err.message` (for callers that read the exception directly) and `body.message` (for callers that parse the JSON body) with the human copy, while still serving `code` and `reason` to machine handlers. Backwards-compatible — FE code that already keys on `code` keeps working.

### Step 3: Lock in behavior with a spec

**File:** `backend/src/order/order.service.spec.ts`

**Changes:**

Inside the existing `describe('OrderService', …)`, add:

```ts
describe('pickup race 400 payload', () => {
  it('bubbles code, reason, and a human message from validator failure', async () => {
    const supabase = {
      getClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({ single: jest.fn() }),
          }),
        }),
      }),
    };
    const cart = {
      getCart: jest.fn().mockResolvedValue({ items: [{ product_id: 1, quantity: 1 }] }),
    };
    const draft = { clearForSession: jest.fn() };
    const pickup = {
      loadValidationBundle: jest.fn().mockResolvedValue({
        settings: {
          timeSlots: ['15:00'],
          windowDays: 30,
          disabledWeekdays: [],
          closureStartDate: null,
          closureEndDate: null,
        },
        locations: [{ id: 'loc-1', is_active: true }],
      }),
    };
    const service = new OrderService(supabase as any, cart as any, draft as any, pickup as any);

    await expect(
      service.createOrder('sess-1', null, {
        customer_name: 'A',
        customer_phone: '0912345678',
        customer_address: 'Hsinchu',
        payment_method: 'line',
        pickup_method: 'in_person',
        pickup_location_id: 'loc-1',
        pickup_at: '2020-01-01T15:00:00+08:00', // past → validator rejects
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'pickup_slot_unavailable',
        reason: 'pickup_in_past',
        message: expect.stringContaining('pickup time has already passed'),
      }),
    });
  });
});
```

**Rationale:** Verifies the three-field shape end-to-end via the real `BadRequestException` path. `rejects.toMatchObject` on `{ response }` matches Nest's internal exception shape without coupling to `err.message` string.

### Step 4: Trim-then-reject in `updateLocation()`

**File:** `backend/src/pickup/pickup.service.ts`

**Changes:**

Locate the existing block (around line 135):

```ts
async updateLocation(id: string, dto: UpdatePickupLocationDto): Promise<PickupLocation> {
  const payload: Record<string, unknown> = {};
  if (dto.label_zh !== undefined) payload.label_zh = dto.label_zh.trim();
  if (dto.label_en !== undefined) payload.label_en = dto.label_en.trim();
  if (dto.is_active !== undefined) payload.is_active = dto.is_active;
  if (dto.sort_order !== undefined) payload.sort_order = dto.sort_order;
  …
```

Replace the label handling with:

```ts
async updateLocation(id: string, dto: UpdatePickupLocationDto): Promise<PickupLocation> {
  const payload: Record<string, unknown> = {};
  if (dto.label_zh !== undefined) {
    const trimmed = dto.label_zh.trim();
    if (!trimmed) throw new BadRequestException('label_required');
    payload.label_zh = trimmed;
  }
  if (dto.label_en !== undefined) {
    const trimmed = dto.label_en.trim();
    if (!trimmed) throw new BadRequestException('label_required');
    payload.label_en = trimmed;
  }
  if (dto.is_active !== undefined) payload.is_active = dto.is_active;
  if (dto.sort_order !== undefined) payload.sort_order = dto.sort_order;
  …
```

**Rationale:** Mirrors `createLocation()` so the rule lives in one shape. The error string `label_required` matches the create path, keeping the FE's toast mapping uniform.

### Step 5: Spec the admin label trim-reject

**File:** `backend/src/pickup/pickup.service.spec.ts`

**Changes:**

Add a focused test group (create the spec file if it does not exist; if it does, append):

```ts
import { BadRequestException } from '@nestjs/common';
import { PickupService } from './pickup.service';

describe('PickupService.updateLocation label hygiene', () => {
  const makeService = () =>
    new PickupService({
      getClient: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest
                  .fn()
                  .mockResolvedValue({
                    data: { id: 'x', label_zh: 'x', label_en: 'x' },
                    error: null,
                  }),
              }),
            }),
          }),
          select: jest.fn().mockReturnValue({
            eq: jest
              .fn()
              .mockReturnValue({ neq: jest.fn().mockResolvedValue({ count: 5, error: null }) }),
          }),
        }),
      }),
    } as any);

  it('rejects whitespace-only label_zh', async () => {
    const service = makeService();
    await expect(service.updateLocation('id-1', { label_zh: '   ' } as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects whitespace-only label_en', async () => {
    const service = makeService();
    await expect(
      service.updateLocation('id-1', { label_en: '\t\n' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('trims a padded non-empty label', async () => {
    const service = makeService();
    await expect(
      service.updateLocation('id-1', { label_zh: '  Holland  ' } as any),
    ).resolves.toBeDefined();
  });
});
```

**Rationale:** Separate `describe` keeps the new invariants readable and doesn't entangle with existing `softDeleteLocation` tests. Uses the repo's inline-mock pattern — no jest helpers, no factories.

## Testing Steps

1. From the repo root: `cd backend && npx jest src/order/order.service.spec.ts src/pickup/pickup.service.spec.ts` — both files green.
2. `npm run lint` at the root — green.
3. `npm run test` at the root — unchanged count plus the new cases.
4. Smoke:
   - `curl -X PATCH -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" -d '{"label_zh":"   "}' $API/api/admin/pickup-locations/$LOC_ID` → 400 with `{ "message": "label_required", "statusCode": 400, "error": "Bad Request" }`.
   - Trigger a pickup race: lock out a slot in the admin UI after a customer has selected it, submit the order → response body is `{ "code":"pickup_slot_unavailable", "reason":"...", "message":"..." }`.

## Dependencies

- Must complete before: `frontend-fixes.md` Step 3 (FE toast mapping can widen once `message` is guaranteed present, but it should still fall back gracefully so ordering with the FE is fine).
- Depends on: none.

## Notes

- The `message` strings are intentionally English. Localization happens on the FE via `cart.pickup.errors.*` keys keyed on `reason`; the BE `message` is a stable fallback for cases where the FE does not have a localized copy yet.
- Do not remove the `MinLength(1)` decorator from `UpdatePickupLocationDto`. It still rejects literal empty strings cheaply at the DTO boundary; the service-layer check handles the whitespace case `class-validator` misses.
- The spec in Step 3 uses `rejects.toMatchObject({ response })`. If the Nest internal exception shape changes in a future major, switch to inspecting `err.getResponse()` manually.
