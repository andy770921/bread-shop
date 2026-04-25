# Implementation Plan: Backend API

## Overview

Adds a `ShopSettingsModule` that owns the singleton `shop_settings` row and exposes:

- `GET /api/shop-settings` — public read (no auth, no session middleware needed; same shape as the public `GET /api/pickup-settings` endpoint from FEAT-10).
- `PUT /api/admin/feature-flags/shop-settings` — admin write, registered on the existing `FeatureFlagsAdminController` so the admin Feature Flags page stays one logical bucket.

It rewires `CartService.computeTotals()` and `OrderService.create()` to read shipping fee + threshold from this row instead of the `CART_CONSTANTS` import. When `shipping_enabled = false`, the computed `shipping_fee` is forced to `0` regardless of subtotal.

## Files to Modify

### Backend Changes — new files

- `backend/src/shop-settings/shop-settings.module.ts` — NestJS module, `@Global()` so any service can inject `ShopSettingsService` without an explicit import (mirrors how `SupabaseModule` is global).
- `backend/src/shop-settings/shop-settings.service.ts` — read/update + 30s in-process cache.
- `backend/src/shop-settings/shop-settings.controller.ts` — `GET /api/shop-settings`.
- `backend/src/shop-settings/dto/update-shop-settings.dto.ts` — `class-validator` shape used by both the admin endpoint and the service-layer write.

### Backend Changes — modified files

- `backend/src/app.module.ts` — register `ShopSettingsModule`.
- `backend/src/admin/feature-flags-admin.controller.ts` — add `GET` widening (embed `shopSettings`) and the new `PUT shop-settings` route.
- `backend/src/admin/feature-flags-admin.service.ts` — extend `get()` so it returns `{ homeVisibleCategoryIds, shopSettings }`; add `updateShopSettings(dto, adminUserId)` delegating to `ShopSettingsService`.
- `backend/src/admin/admin.module.ts` — confirm the admin module imports `ShopSettingsModule` (only needed if the `@Global()` decision is reverted).
- `backend/src/cart/cart.service.ts` — replace the `CART_CONSTANTS.SHIPPING_FEE` / `CART_CONSTANTS.FREE_SHIPPING_THRESHOLD` reads at lines 326, 172, 279 with a call to `ShopSettingsService.getSettings()`.
- `backend/src/order/order.service.ts` — same replacement at lines 158–163.
- `backend/src/cart/cart.module.ts` and `backend/src/order/order.module.ts` — only need a change if `ShopSettingsModule` is **not** `@Global()`.

### Shared Types

- `shared/src/types/shop-settings.ts` — new file:
  ```ts
  export interface ShopSettings {
    shippingEnabled: boolean;
    shippingFee: number;
    freeShippingThreshold: number;
    promoBannerEnabled: boolean;
  }
  export type UpdateShopSettingsRequest = ShopSettings;
  ```
- `shared/src/types/index.ts` — re-export `ShopSettings` and `UpdateShopSettingsRequest`.
- `shared/src/constants/cart.ts` — delete `SHIPPING_FEE` and `FREE_SHIPPING_THRESHOLD`. Keep `MAX_ITEM_QUANTITY`.

## Step-by-Step Implementation

### Step 1: Shared types + constants cleanup

**File:** `shared/src/types/shop-settings.ts` (new)

```ts
export interface ShopSettings {
  shippingEnabled: boolean;
  shippingFee: number;
  freeShippingThreshold: number;
  promoBannerEnabled: boolean;
}

export type UpdateShopSettingsRequest = ShopSettings;
```

**File:** `shared/src/index.ts` (the canonical barrel — there is no `shared/src/types/index.ts`)

Append next to the existing `export * from './types/feature-flags';` line:

```ts
export * from './types/shop-settings';
```

While editing the same area, **widen** the existing `FeatureFlagsResponse` in `shared/src/types/feature-flags.ts` to embed `shopSettings`. This keeps the response type canonical so the admin frontend's `useFeatureFlags()` hook can keep its current `import type { FeatureFlagsResponse } from '@repo/shared'` line — no parallel/local interface needed:

```ts
import type { ShopSettings } from './shop-settings';

export interface FeatureFlagsResponse {
  homeVisibleCategoryIds: number[];
  shopSettings: ShopSettings;
}

export interface UpdateHomeVisibleCategoriesRequest {
  category_ids: number[];
}
```

**File:** `shared/src/constants/cart.ts`

```ts
export const CART_CONSTANTS = {
  MAX_ITEM_QUANTITY: 99,
} as const;
```

**Rationale:** camelCase on the wire matches the existing `PickupSettings` and `AdminDashboardStats` conventions. Removing the shipping constants here forces the compiler to surface every site that depended on them — a directed migration rather than dead-code drift.

After this step, `npm run build --workspace @repo/shared` will surface the seven downstream errors documented in `customer-frontend.md` Step 1 and the cart/order callsites in Step 5 below; this is intentional.

### Step 2: `ShopSettingsService`

**File:** `backend/src/shop-settings/shop-settings.service.ts` (new)

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import type { ShopSettings, UpdateShopSettingsRequest } from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';

const SETTINGS_ID = 1;
const CACHE_TTL_MS = 30_000;

interface ShopSettingsRow {
  shipping_enabled: boolean;
  shipping_fee: number;
  free_shipping_threshold: number;
  promo_banner_enabled: boolean;
}

function rowToSettings(row: ShopSettingsRow): ShopSettings {
  return {
    shippingEnabled: row.shipping_enabled,
    shippingFee: row.shipping_fee,
    freeShippingThreshold: row.free_shipping_threshold,
    promoBannerEnabled: row.promo_banner_enabled,
  };
}

@Injectable()
export class ShopSettingsService {
  private cache: { value: ShopSettings; expiresAt: number } | null = null;

  constructor(private supabase: SupabaseService) {}

  async getSettings(): Promise<ShopSettings> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;

    const { data, error } = await this.supabase
      .getClient()
      .from('shop_settings')
      .select('shipping_enabled, shipping_fee, free_shipping_threshold, promo_banner_enabled')
      .eq('id', SETTINGS_ID)
      .single();
    if (error) throw new BadRequestException(error.message);
    const settings = rowToSettings(data as ShopSettingsRow);
    this.cache = { value: settings, expiresAt: now + CACHE_TTL_MS };
    return settings;
  }

  async updateSettings(dto: UpdateShopSettingsRequest, adminUserId: string): Promise<ShopSettings> {
    const { data, error } = await this.supabase
      .getClient()
      .from('shop_settings')
      .update({
        shipping_enabled: dto.shippingEnabled,
        shipping_fee: dto.shippingFee,
        free_shipping_threshold: dto.freeShippingThreshold,
        promo_banner_enabled: dto.promoBannerEnabled,
        updated_by: adminUserId,
      })
      .eq('id', SETTINGS_ID)
      .select('shipping_enabled, shipping_fee, free_shipping_threshold, promo_banner_enabled')
      .single();
    if (error) throw new BadRequestException(error.message);
    const settings = rowToSettings(data as ShopSettingsRow);
    this.cache = { value: settings, expiresAt: Date.now() + CACHE_TTL_MS };
    return settings;
  }
}
```

**Rationale:**

- The 30s in-process cache is critical: `CartService.computeTotals()` runs on every cart endpoint and would otherwise pull from Postgres dozens of times per cart-page session. The TTL is short enough that admin changes propagate within half a minute even without explicit invalidation.
- `updateSettings()` re-seeds the cache with the freshly written row, so the admin's own next read is consistent.
- Public-read narrowing — `select('...')` lists only the four functional columns, never `updated_by` / `updated_at`. Same leakage-prevention pattern as `pickup.service.ts:198`.

### Step 3: `UpdateShopSettingsDto`

**File:** `backend/src/shop-settings/dto/update-shop-settings.dto.ts` (new)

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateShopSettingsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  shippingEnabled: boolean;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(0)
  @Max(9999)
  shippingFee: number;

  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(0)
  @Max(999999)
  freeShippingThreshold: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  promoBannerEnabled: boolean;
}
```

**Rationale:** Range bounds match the DB CHECK constraints in `database-schema.md`. The DTO accepts `shippingFee` / `freeShippingThreshold` even when `shippingEnabled` is false — the values are simply ignored at compute time. This keeps the form simple (no conditional validation) and avoids losing the admin's previous numbers when they toggle off and back on.

### Step 4: Public + admin controllers

**File:** `backend/src/shop-settings/shop-settings.controller.ts` (new)

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ShopSettingsService } from './shop-settings.service';

@ApiTags('Shop Settings')
@Controller('api/shop-settings')
export class ShopSettingsController {
  constructor(private service: ShopSettingsService) {}

  @Get()
  @ApiOkResponse({ description: 'Public shop-wide settings (shipping + promo banner toggle).' })
  get() {
    return this.service.getSettings();
  }
}
```

**File:** `backend/src/admin/feature-flags-admin.controller.ts` (modified)

Keep every existing class-level decorator (`@ApiTags('Admin')`, `@ApiBearerAuth()`) so Swagger output stays consistent with `pickup-admin.controller.ts` and `content-admin.controller.ts`. For the admin user id, use the project's existing `@CurrentUser()` decorator (`backend/src/common/decorators/current-user.decorator.ts`) — this is what `PickupAdminController.updateSettings` already uses, so reuse it instead of casting `req.user`:

```ts
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FeatureFlagsAdminService } from './feature-flags-admin.service';
import { UpdateHomeVisibleCategoriesDto } from './dto/update-home-visible-categories.dto';
import { UpdateShopSettingsDto } from '../shop-settings/dto/update-shop-settings.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('api/admin/feature-flags')
@UseGuards(AdminAuthGuard)
export class FeatureFlagsAdminController {
  constructor(private service: FeatureFlagsAdminService) {}

  @Get()
  get() { return this.service.get(); }

  @Put('home-visible-categories')
  updateHomeVisibleCategories(@Body() dto: UpdateHomeVisibleCategoriesDto) {
    return this.service.replaceHomeVisibleCategories(dto.category_ids);
  }

  @Put('shop-settings')
  updateShopSettings(
    @Body() dto: UpdateShopSettingsDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.updateShopSettings(dto, user.id);
  }
}
```

**File:** `backend/src/admin/feature-flags-admin.service.ts` (extended)

```ts
async get() {
  const supabase = this.supabase.getClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('visible_on_home', true);
  if (error) throw new BadRequestException(error.message);
  const homeVisibleCategoryIds = (data ?? []).map((r) => r.id as number);
  const shopSettings = await this.shopSettings.getSettings();
  return { homeVisibleCategoryIds, shopSettings };
}

async updateShopSettings(dto: UpdateShopSettingsRequest, adminUserId: string) {
  return this.shopSettings.updateSettings(dto, adminUserId);
}
```

(Inject `ShopSettingsService` via the constructor.)

**Rationale:** Embedding `shopSettings` inside the existing `GET /api/admin/feature-flags` keeps the admin Feature Flags page to a single initial query. The `homeVisibleCategoryIds` field shape is unchanged — no admin-frontend breakage.

### Step 5: Wire `ShopSettings` into cart and order math

**File:** `backend/src/cart/cart.service.ts`

Replace the `CART_CONSTANTS.FREE_SHIPPING_THRESHOLD` / `CART_CONSTANTS.SHIPPING_FEE` reads at line 326 with a call into the injected `ShopSettingsService`:

```ts
const settings = await this.shopSettings.getSettings();
const shipping_fee = !settings.shippingEnabled
  ? 0
  : subtotal === 0
    ? 0
    : subtotal >= settings.freeShippingThreshold
      ? 0
      : settings.shippingFee;
```

The empty-cart branches at lines 172 and 279 already return `shipping_fee: 0` directly — leave those alone.

**File:** `backend/src/order/order.service.ts`

`order.service.ts` has **two** compute sites that read the constants, not one:

- Lines 158–163 inside `createOrder()` — the path that turns a cart into a persisted order row.
- Lines 304–309 inside the secondary cart-snapshot computation used by the LINE pending-checkout flow.

Both must be migrated. Line 1 imports `CART_CONSTANTS`, which can stay (the file still uses `CART_CONSTANTS.MAX_ITEM_QUANTITY` at lines 231 / 246). Inject `ShopSettingsService` via the constructor and replace each compute site with the same `!settings.shippingEnabled ? 0 : subtotal === 0 ? 0 : subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFee` ladder. The persisted `shipping_fee` continues to be computed once at create time and stored on the row.

Missing the second site would silently leave the LINE flow charging the legacy 60 / 500 numbers regardless of admin toggles — exactly the bug FEAT-12 is meant to remove.

**Rationale:** The shipping-disabled branch comes first so an OFF toggle short-circuits without consulting subtotal. The empty-cart short-circuit (`subtotal === 0`) is preserved; without it, an empty cart with `freeShippingThreshold = 0` would resolve to `subtotal >= 0` → free, which is technically correct but masks the intent.

### Step 5b: Session middleware behavior on `/api/shop-settings`

`SessionMiddleware` (`backend/src/common/middleware/session.middleware.ts`) only creates a fresh `sessions` row when the request is `GET /api/{cart,favorites,orders,auth/me,user/...}` or any non-GET. `GET /api/shop-settings` is not in the create-list, so unauthenticated home-page visitors trigger no session insert. A guest who already has a `session_id` cookie will, however, still cause a per-request `sessions` UPDATE (last-seen keep-alive). This matches the existing FEAT-10 `/api/pickup-settings` behaviour and is acceptable — no middleware change required. Document the assumption so it does not get relitigated in code review.

### Step 6: Module registration

**File:** `backend/src/shop-settings/shop-settings.module.ts` (new)

```ts
import { Global, Module } from '@nestjs/common';
import { ShopSettingsService } from './shop-settings.service';
import { ShopSettingsController } from './shop-settings.controller';

@Global()
@Module({
  providers: [ShopSettingsService],
  controllers: [ShopSettingsController],
  exports: [ShopSettingsService],
})
export class ShopSettingsModule {}
```

**File:** `backend/src/app.module.ts`

```ts
imports: [
  // ...existing modules
  ShopSettingsModule,
],
```

**Rationale:** `@Global()` matches `SupabaseModule`. `CartService` and `OrderService` get `ShopSettingsService` injected without each module needing to import `ShopSettingsModule`. No `forFeature`-style ceremony.

**Important — module ordering:** Even with `@Global()`, register `ShopSettingsModule` in `app.module.ts` *before* `CartModule` and `OrderModule` in the `imports` array. Nest resolves global providers when each module is bootstrapped, so a cart/order module that bootstraps before `ShopSettingsModule` registers will throw `Nest can't resolve dependencies of CartService (?)` at startup. This is the same constraint that already applies to `SupabaseModule` (already imported first).

For symmetry with how `PickupModule` is consumed (it is *not* `@Global` — `OrderModule` and `AdminModule` import it explicitly to get `PickupService`), an alternative is to drop `@Global()` and have `CartModule`, `OrderModule`, and `AdminModule` each list `ShopSettingsModule` in their `imports`. Either approach works. The PRD picks `@Global()` for fewer touch points; if the team prefers explicitness, switch the decorator and add three import lines — no other change needed.

## Testing Steps

1. **Unit — `shop-settings.service.spec.ts` (new):**
   - `getSettings()` reads the row once, then serves the second call from cache (assert Supabase mock called once).
   - `updateSettings()` writes through and overwrites the cache (next `getSettings` returns the new value without another DB read).
   - Cache TTL — fast-forward `Date.now` past 30s and assert the next read hits the DB again.

2. **Unit — `cart.service.spec.ts`:** add three cases:
   - `shippingEnabled=true, subtotal=400` → `shipping_fee = 60`.
   - `shippingEnabled=true, subtotal=500` → `shipping_fee = 0`.
   - `shippingEnabled=false, subtotal=400` → `shipping_fee = 0`.

3. **Unit — `order.service.spec.ts`:** mirror the three cases. Add a fourth: an order placed with settings `(60, 500)` keeps `shipping_fee = 60` even after the test mutates settings to `(80, 1000)` — confirms the service does not retroactively recompute.

4. **E2E — `feature-flags-admin.controller.e2e-spec.ts` (extend existing or new):**
   - As an admin, `PUT /api/admin/feature-flags/shop-settings` with `{ shippingEnabled: false, ... }`.
   - Then `GET /api/shop-settings` returns `shippingEnabled: false`.
   - Then `GET /api/cart` for a session with items totalling 200 returns `shipping_fee: 0`.
   - Re-enable, set `shippingFee: 80`, threshold `1000`. New cart fetch → `shipping_fee: 80`.

5. **Manual — Swagger UI:** `/api/docs` shows the new `Shop Settings` tag and the admin route under `Admin`.

## Dependencies

- Must complete before: `customer-frontend.md`, `admin-frontend.md`.
- Depends on: `database-schema.md` (table must exist).

## Notes

- **No CSRF / double-submit consideration** — admin endpoints rely on Bearer JWT and the same `AdminAuthGuard` as every other admin route. Nothing new here.
- **No public write endpoint.** A common temptation is to expose a "promo dismiss" cookie — out of scope; the banner is shop-wide, not per-user.
- **Cache invalidation across serverless cold instances.** Each Vercel serverless instance has its own 30s cache. An admin write only invalidates the instance that handled the PUT; other instances eventually see the change after their TTL expires. The customer FE adds a second layer (`useShopSettings`'s `staleTime: 5 * 60_000`), so the worst-case visible lag for an open customer browser tab is **5 minutes**, not 30 seconds. To keep the two layers in step, drop the customer FE `staleTime` to `30_000` so any FE refetch lines up with the next cache miss on the backend. The PRD's claim that "changes take effect immediately on the next cart load" should be read as "next cart load **after** ≤30 seconds." Document the trade-off in `documents/FEAT-12/development/qa-checklist.md` so it is not relitigated.
- **Order historical correctness.** `OrderService.create()` reads `ShopSettingsService.getSettings()` and writes the resolved `shipping_fee` onto the row. Subsequent admin edits do not mutate that row. This is the same pattern the customer cart already follows for product price snapshots (`order_items.unit_price`).
