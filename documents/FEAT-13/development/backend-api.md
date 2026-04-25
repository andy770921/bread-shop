# Implementation Plan: Backend API

## Overview

Adds:

1. Two columns to the `ShopSettings` shared type and `UpdateShopSettingsDto`.
2. A new `InventoryService` co-located with `ShopSettingsModule` that owns the daily-load aggregate and the capacity check.
3. A new public endpoint `GET /api/pickup-availability` exposing `{mode, limit, fullDates}` to the customer FE.
4. A guard call inside `OrderService.createOrder` that rejects the insert when the chosen `pickup_at` would overflow the daily cap.

No changes to `CartService`. The cap only blocks order *creation*, never cart math.

## Files to Modify

### Backend Changes — new files

- `backend/src/shop-settings/inventory.service.ts` — daily-load aggregate + capacity guard.
- `backend/src/shop-settings/inventory.service.spec.ts` — unit test the guard's three branches.
- `backend/src/pickup/pickup-availability.controller.ts` — public read endpoint.

### Backend Changes — modified files

- `backend/src/shop-settings/shop-settings.module.ts` — register `InventoryService`, export it so `OrderService` can inject (it can already because the module is `@Global()`).
- `backend/src/shop-settings/shop-settings.service.ts` — extend `rowToSettings` and `updateSettings` payload to carry the two new fields.
- `backend/src/shop-settings/dto/update-shop-settings.dto.ts` — add `inventoryMode` and `dailyTotalLimit` validators.
- `backend/src/order/order.service.ts` — inject `InventoryService` and call `assertHasCapacity` after pickup validation.
- `backend/src/pickup/pickup.module.ts` — register the new controller.
- `backend/src/product/product.service.ts` and `backend/src/admin/product-admin.service.ts` — add `ingredients_zh` / `ingredients_en` to the SELECT lists and the create/update payload pipelines (coerce empty strings to `null`).
- `backend/src/admin/dto/create-product.dto.ts` and `backend/src/admin/dto/update-product.dto.ts` — add the two optional ingredients fields.

### Shared Types

- `shared/src/types/shop-settings.ts` — widen `ShopSettings` and `UpdateShopSettingsRequest`.
- `shared/src/types/pickup-availability.ts` — new file exporting `PickupAvailability`.
- `shared/src/types/product.ts` — widen `Product` (and `ProductWithCategory`, which is the type returned to the admin path; there is **no** separate `AdminProduct` type) with `ingredients_zh: string | null` and `ingredients_en: string | null`.
- `shared/src/index.ts` — `export * from './types/pickup-availability';`.

## Step-by-Step Implementation

### Step 1: Shared types

**File:** `shared/src/types/shop-settings.ts`

```ts
export type InventoryMode = 'unlimited' | 'daily_total';

export interface ShopSettings {
  shippingEnabled: boolean;
  shippingFee: number;
  freeShippingThreshold: number;
  promoBannerEnabled: boolean;
  inventoryMode: InventoryMode;
  dailyTotalLimit: number;
}

export type UpdateShopSettingsRequest = ShopSettings;
```

**File:** `shared/src/types/pickup-availability.ts` (new)

```ts
import type { InventoryMode } from './shop-settings';

export interface PickupAvailability {
  mode: InventoryMode;
  limit: number | null;
  fullDates: string[]; // YYYY-MM-DD in Asia/Taipei
}
```

**File:** `shared/src/index.ts` — add `export * from './types/pickup-availability';` next to the existing `export * from './types/shop-settings';`.

**Rationale:** `InventoryMode` is exported as a named type because both the shared payload and the BE's class-validator decorator key off the same string union. `fullDates` is `string[]` not `Date[]` because TanStack Query serialises responses as JSON and the customer FE needs a `Set<string>` lookup, not a `Set<Date>`.

### Step 2: Extend `ShopSettingsService`

**File:** `backend/src/shop-settings/shop-settings.service.ts`

- Add `inventory_mode` and `daily_total_limit` to the `ShopSettingsRow` interface and the SELECT lists in both `getSettings()` and `updateSettings()`.
- `rowToSettings()` maps:
  ```ts
  inventoryMode: row.inventory_mode as InventoryMode,
  dailyTotalLimit: row.daily_total_limit,
  ```
- `updateSettings()` writes:
  ```ts
  inventory_mode: dto.inventoryMode,
  daily_total_limit: dto.dailyTotalLimit,
  ```

**Rationale:** Two new fields follow the existing camelCase-on-the-wire / snake_case-in-DB convention. The 30s in-process cache from FEAT-12 still works — it just covers six fields now.

### Step 3: Extend `UpdateShopSettingsDto`

**File:** `backend/src/shop-settings/dto/update-shop-settings.dto.ts`

```ts
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import type { InventoryMode } from '@repo/shared';

export class UpdateShopSettingsDto {
  /* ...existing four fields... */

  @ApiProperty({ example: 'unlimited', enum: ['unlimited', 'daily_total'] })
  @IsIn(['unlimited', 'daily_total'])
  inventoryMode: InventoryMode;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(999)
  dailyTotalLimit: number;
}
```

**Rationale:** `dailyTotalLimit` is required even when `inventoryMode = 'unlimited'`. The admin form always sends both — if the dropdown is `不設定庫存`, the previously-saved limit value goes along for the ride. Conditional validation would just lose the user's last number.

### Step 4: New `InventoryService`

**File:** `backend/src/shop-settings/inventory.service.ts` (new)

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ShopSettingsService } from './shop-settings.service';

@Injectable()
export class InventoryService {
  constructor(
    private supabase: SupabaseService,
    private shopSettings: ShopSettingsService,
  ) {}

  /**
   * Returns a map of Asia/Taipei YYYY-MM-DD -> total non-cancelled item quantity
   * for every pickup date inside the booking window (≥ today).
   */
  async getDailyLoad(): Promise<Map<string, number>> {
    const { data, error } = await this.supabase.getClient().rpc('get_daily_pickup_load');
    if (error) throw new BadRequestException(error.message);
    const map = new Map<string, number>();
    for (const row of (data ?? []) as { pickup_date: string; total_quantity: number }[]) {
      map.set(row.pickup_date, Number(row.total_quantity));
    }
    return map;
  }

  async getFullDates(): Promise<{ mode: 'unlimited' | 'daily_total'; limit: number | null; fullDates: string[] }> {
    const settings = await this.shopSettings.getSettings();
    if (settings.inventoryMode === 'unlimited') {
      return { mode: 'unlimited', limit: null, fullDates: [] };
    }
    const load = await this.getDailyLoad();
    const limit = settings.dailyTotalLimit;
    const fullDates: string[] = [];
    for (const [date, qty] of load) {
      if (qty >= limit) fullDates.push(date);
    }
    fullDates.sort();
    return { mode: 'daily_total', limit, fullDates };
  }

  async assertHasCapacity(pickupAt: Date, additionalQuantity: number): Promise<void> {
    const settings = await this.shopSettings.getSettings();
    if (settings.inventoryMode === 'unlimited') return;
    const ymd = ymdInTaipei(pickupAt);
    const load = await this.getDailyLoad();
    const currentLoad = load.get(ymd) ?? 0;
    const limit = settings.dailyTotalLimit;
    if (currentLoad + additionalQuantity > limit) {
      throw new BadRequestException({
        code: 'daily_inventory_full',
        message: '此日期已額滿',
        date: ymd,
        limit,
        currentLoad,
      });
    }
  }
}

function ymdInTaipei(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
```

**Step 4b — companion Postgres RPC** (apply via Supabase MCP `apply_migration`, name `feat_13_get_daily_pickup_load`):

```sql
CREATE OR REPLACE FUNCTION public.get_daily_pickup_load()
RETURNS TABLE(pickup_date date, total_quantity bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT (o.pickup_at AT TIME ZONE 'Asia/Taipei')::date AS pickup_date,
         COALESCE(SUM(oi.quantity), 0)::bigint            AS total_quantity
  FROM   public.orders o
  JOIN   public.order_items oi ON oi.order_id = o.id
  WHERE  o.status <> 'cancelled'
    AND  o.pickup_at >= now()
  GROUP BY 1
$$;
```

**Rationale:**

- The RPC keeps the query close to the data and lets us add a partial index later without changing the JS code.
- `STABLE` because the function is read-only and depends on `now()`; `IMMUTABLE` would be wrong.
- `AT TIME ZONE 'Asia/Taipei'` buckets by the Taipei wall-clock date, matching how the FE composes `pickup_at` from `date + timeSlot` in `composePickupAt()` (FEAT-10 customer FE).
- `WHERE o.pickup_at >= now()` shrinks the result to the booking window. We do not include past dates because the calendar never offers them.
- Service role bypasses RLS by default — the RPC inherits the caller's privileges, and `OrderService` uses the service-role client.
- `assertHasCapacity` runs against the *fresh* aggregate (not the cached `ShopSettingsService.getSettings()` cache map) so two concurrent submits cannot both pass when only one slot remains.

### Step 5: New public controller

**File:** `backend/src/pickup/pickup-availability.controller.ts` (new)

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { InventoryService } from '../shop-settings/inventory.service';

@ApiTags('Pickup')
@Controller('api/pickup-availability')
export class PickupAvailabilityController {
  constructor(private inventory: InventoryService) {}

  @Get()
  @ApiOkResponse({ description: 'Public daily pickup capacity (full dates + cap mode).' })
  get() {
    return this.inventory.getFullDates();
  }
}
```

**File:** `backend/src/pickup/pickup.module.ts` — register the new controller in the `controllers` array (no provider change needed because `InventoryService` is exported by the `@Global()` `ShopSettingsModule`).

**Rationale:** Co-locating with the existing `pickup` URL group keeps the customer FE's path layout consistent (`/api/pickup-settings`, `/api/pickup-availability`).

### Step 6: Wire `InventoryService` into `OrderService.createOrder`

**File:** `backend/src/order/order.service.ts`

- Add `private inventory: InventoryService` to the constructor.
- After the existing pickup validator block (line ~108) and before the cart snapshot fetch (line ~113), compute the new order's total quantity and call:

```ts
const newOrderQuantity = (dto.cart_snapshot?.items ?? []).reduce(
  (sum, item) => sum + (Number(item.quantity) || 0),
  0,
);
// Falls back to the in-DB cart for non-LINE flows where cart_snapshot is empty.
const cartForCount = newOrderQuantity > 0
  ? newOrderQuantity
  : (await this.cartService.getCart(sessionId, userId ?? undefined)).items
      .reduce((sum, item) => sum + item.quantity, 0);

await this.inventory.assertHasCapacity(new Date(dto.pickup_at), cartForCount);
```

The guard runs *before* we INSERT into `orders`. If it throws, no row is written and the customer's cart stays intact for a retry.

**Rationale:** Calling the guard after the pickup validator (which already ensures `pickup_at` is in-window and on a bookable weekday) avoids spending an aggregate query on requests that would have failed anyway. Reading the cart twice (here and at line 113 for the canonical normalisation) is fine — `getCart` is fast and the path runs once per submit.

**Defensive call at LINE-checkout start.** The customer FE's `useCheckoutFlow.submitCheckout` calls `POST /api/auth/line/start` *before* the LINE OAuth redirect. That endpoint stores the form data in `pending_line_orders` and returns either `next: 'line_login'` (redirect) or `next: 'confirm'` (run `createOrder` immediately). To avoid sending the customer through a LINE login round-trip just to be told the date is full when they come back, `AuthController.lineStart` runs `inventory.assertHasCapacity(new Date(form_data.pickup_at), totalCartQuantity)` before storing the pending row. The same guard runs again at confirm time inside `createOrder` so the race-safety property is unchanged — this is a UX defense, not a correctness defense. Since both calls go through the uncached `getSettingsFresh` + fresh aggregate path, the start-time check sees the same load as the confirm-time check (modulo the milliseconds in between).

**Module wiring is already covered by FEAT-12.** `ShopSettingsModule` is `@Global()` (`backend/src/shop-settings/shop-settings.module.ts:5`), so `OrderModule` (`imports: [CartModule, PickupModule]` at `backend/src/order/order.module.ts:7-13`) does **not** need to add `ShopSettingsModule` to its imports for `InventoryService` injection to work. State this explicitly so a future review doesn't add a redundant import line.

**Verify spec mock count before adding a sixth.** `OrderService` today has **five** constructor args (`supabaseService, cartService, cartContactDraftService, pickupService, shopSettings`) — the FEAT-12 doc said "five", and that is current. Adding `inventory` makes six. The existing `order.service.spec.ts` instantiates `new OrderService(...)` with five `as any` mocks; add a sixth: `{ assertHasCapacity: jest.fn().mockResolvedValue(undefined) } as any`.

**Public `GET /api/shop-settings` automatically widens.** `backend/src/shop-settings/shop-settings.controller.ts` calls `service.getSettings()` and returns the result verbatim. Once `rowToSettings()` includes `inventoryMode` and `dailyTotalLimit`, the public endpoint emits the six-field shape unchanged — no controller edit needed. The customer FE's `useShopSettings` therefore sees the new fields the moment the BE redeploys.

**Race-safety is wider than the FEAT-12 doc implied.** `assertHasCapacity` runs the `STABLE` RPC (read-only) followed by an INSERT, with no surrounding Postgres transaction. Two near-simultaneous `createOrder` calls on the same date can both pass and both INSERT — the customer FE expects exactly one to receive a 400, but neither will. v1 ships with this caveat (Papa Bakery's order rate is single-digit/day; the millisecond race window is acceptable). The QA checklist must **not** promise "100% race-safe" — describe the guard as "best-effort, blocks the common case where the customer fills the form *after* the day became full." A future ticket can wrap the SELECT+INSERT in a Postgres function with `FOR UPDATE` on the singleton `shop_settings` row, or use a `pg_advisory_xact_lock(hashtext(pickup_date::text))`.

### Step 6b: Product service + DTOs gain `ingredients_zh` / `ingredients_en`

**Files:**
- `backend/src/product/product.service.ts` and `backend/src/admin/product-admin.service.ts` — **no SELECT-list edits required.** Every product fetch in these files uses `select('*, category:categories(...)')` or bare `.select()` (verified at `product.service.ts:13, 20, 37` and `product-admin.service.ts:23, 34, 67`). Once the columns exist on `products`, both fields flow through automatically. The narrow SELECTs in `order.service.ts:123, 268` and `cart.service.ts:189` intentionally omit description / specs / ingredients (cart-canonicalisation only needs `id, price, name_*, image_url, category`) and **stay as-is**.
- `backend/src/admin/product-admin.service.ts` — `create()` and `update()` today pass `dto` straight to Supabase (`.insert(dto)` at line 44, `.update(dto)` at line 64). They do **not** coerce empty strings to `null` — `description_zh: ''` from the form lands as `''` in Postgres today. The plan's earlier claim "mirrors how `description_*` are handled" was wrong. Pick one approach and stick with it consistently:
  - **Option A (recommended for FEAT-13)**: do **not** introduce `'' → null` coercion. Let `ingredients_zh: ''` land as `''`, exactly like `description_zh` does today. The customer-side `pickLocalizedText` helper already trims values and treats blank/whitespace as falsy, so the `成分` row is correctly omitted whether the DB stores `''` or `NULL`. This keeps `product-admin.service.ts` internally consistent (no field treats empty differently from any other).
  - **Option B**: deliberately add `'' → null` coercion for both the new `ingredients_*` fields **and** the existing `description_*` fields in the same patch, so the file stays internally consistent. More work, more surface area for review; only do this if the team explicitly wants Postgres to never see `''`.
  - The implementer should pick A by default. If they pick B, update the database-schema.md rationale at the same time so the file does not claim a coercion that doesn't exist.
- `backend/src/admin/dto/create-product.dto.ts` and `update-product.dto.ts`:
  ```ts
  @ApiPropertyOptional({ example: '麵粉、糖、奶油' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ingredients_zh?: string;

  @ApiPropertyOptional({ example: 'Flour, sugar, butter' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ingredients_en?: string;
  ```

**Rationale:**

- The public response shape gains both fields unconditionally. The customer FE checks the trimmed value via `pickLocalizedText` and falls back to the other locale — it never crashes if the admin only filled one locale.
- `MaxLength(2000)` is a defensive ceiling — well above any realistic ingredients list, well below pathological payloads.
- Punting on `'' → null` (Option A) is the smaller change and matches every other `*_zh` / `*_en` field on the products table.

### Step 7: Test fixtures

**File:** `backend/src/order/order.service.spec.ts` — the existing test class instantiates `new OrderService(...)` with five `as any` mocks. Add a sixth: `{ assertHasCapacity: jest.fn().mockResolvedValue(undefined) } as any` (no enforcement during the existing tests). Add a new describe block `createOrder inventory cap failure` that injects a mock throwing `BadRequestException({ code: 'daily_inventory_full' })` and asserts the order INSERT mock is never called.

**File:** `backend/src/shop-settings/inventory.service.spec.ts` (new) — three cases:
- `getFullDates` returns `[]` when `mode = 'unlimited'`.
- `getFullDates` returns the correct date list when load matches limit.
- `assertHasCapacity` throws with the documented BadRequest payload when `currentLoad + addQuantity > limit`.

## Testing Steps

1. **Unit (`inventory.service.spec.ts`):** all three branches green.
2. **Unit (`order.service.spec.ts`):** mock `assertHasCapacity` to throw → INSERT mock is not invoked.
3. **E2E (`order.controller.e2e-spec.ts` extension):** seed `daily_total_limit = 3`, place three single-quantity orders for D, then a fourth → 400 with `code: 'daily_inventory_full'`. Cancel one → fourth attempt now returns 201.
4. **E2E (`pickup-availability.controller.e2e-spec.ts` new):** with three orders on D and `mode = 'daily_total'`, GET → `fullDates: ["D"]`. Toggle `mode = 'unlimited'` → `fullDates: []`.
5. **Manual (Swagger):** `/api/docs` shows `Pickup` tag with the new GET, and the admin DTO surfaces the two new fields.

## Dependencies

- Must complete before: `customer-frontend.md`, `admin-frontend.md`.
- Depends on: `database-schema.md` (columns must exist + RPC must exist).

## Notes

- **Why an RPC rather than a Supabase JS chain?** PostgREST's grouping + `AT TIME ZONE` is awkward to express with the Supabase JS client. Encapsulating in an RPC keeps the JS readable and makes the SQL reviewable in one place.
- **Why include `daily_total_limit` in the RPC?** It is *not* in the RPC — the RPC just returns aggregated totals. The cap comparison happens in `InventoryService` so the same RPC is reusable for an upcoming "remaining capacity" endpoint without filter logic baked into SQL.
- **Cancellation impact on cache.** The 30s `ShopSettingsService` cache covers the *settings* row only. The daily-load aggregate is **not cached** — every `assertHasCapacity` and every `getAvailability` hits the RPC fresh. Cancellations therefore free a slot on the very next read.
- **Settings cache bypass on the guard path.** `assertHasCapacity` calls `ShopSettingsService.getSettingsFresh()` (added alongside the cached `getSettings()`), so an admin lowering `dailyTotalLimit` from 5 → 3 takes effect on the very next order submit even within the cache TTL. `CartService.computeTotals` continues to use the cached path because it runs on every cart fetch and does not need second-by-second freshness.
- **Race-safety guarantee.** The `assertHasCapacity` SELECT and the subsequent INSERT are not in a Postgres transaction. Two near-simultaneous submits on the last open slot can theoretically both pass. Acceptable trade-off because (a) the window is ~5–10 ms, (b) Papa Bakery's order rate is single-digit/day, (c) the alternative (a SERIALIZABLE transaction or an advisory lock) adds operational cost. If volume grows, swap the guard for `BEGIN; SELECT ... FOR UPDATE; INSERT ... ; COMMIT;` inside a Postgres function.
