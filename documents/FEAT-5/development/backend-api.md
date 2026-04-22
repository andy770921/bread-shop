# Implementation Plan: Backend API

## Overview

Add a new `AdminModule` (plus submodules) to the existing NestJS backend. All admin endpoints are mounted under `/api/admin/*` and protected by a single `AdminAuthGuard`. A public `GET /api/site-content` endpoint is added for the customer frontend to read copy overrides without authentication.

The backend continues to use the `SupabaseService.getClient()` service-role client for all data operations. No new auth mechanism — admin identity is verified via the existing Supabase Auth JWT plus a `profiles.role` check.

## Files to Modify

### New Files

- `backend/src/admin/admin.module.ts`
- `backend/src/admin/guards/admin-auth.guard.ts`
- `backend/src/admin/dashboard-admin.controller.ts`
- `backend/src/admin/dashboard-admin.service.ts`
- `backend/src/admin/product-admin.controller.ts`
- `backend/src/admin/product-admin.service.ts`
- `backend/src/admin/content-admin.controller.ts`
- `backend/src/admin/content-admin.service.ts`
- `backend/src/admin/order-admin.controller.ts`
- `backend/src/admin/order-admin.service.ts`
- `backend/src/admin/upload-admin.controller.ts`
- `backend/src/admin/upload-admin.service.ts`
- `backend/src/admin/me.controller.ts`
- `backend/src/admin/dto/*.ts` (one per create/update payload)
- `backend/src/site-content/site-content.module.ts`
- `backend/src/site-content/site-content.controller.ts`  (public `GET /api/site-content`)
- `backend/src/site-content/site-content.service.ts`

### Modified Files

- `backend/src/app.module.ts`
  - Import `AdminModule` and `SiteContentModule`
- `backend/src/main.ts`
  - No change (CORS already allows `FRONTEND_URL`; see Step 10 for admin CORS)
- `backend/src/product/product.service.ts`
  - `findAll` / `findOne` return `stock_quantity` (free once the column exists; only worth noting because the type in `@repo/shared` changes)

### Environment Variables

- `backend/.env`
  - `ADMIN_FRONTEND_URL=http://localhost:3002` (add; used by CORS and any admin redirects)
  - `SUPABASE_STORAGE_BUCKET=product-images` (add; reuse existing bucket)

## Step-by-Step Implementation

### Step 1: `AdminAuthGuard`

**File:** `backend/src/admin/guards/admin-auth.guard.ts`

**Why:** Single chokepoint that verifies JWT and checks `profiles.role`. Applied to every admin endpoint.

```ts
import { CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

const ADMIN_ROLES = ['admin', 'owner'] as const;

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const token = header.split(' ')[1];
    const supabase = this.supabaseService.getClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new UnauthorizedException('Invalid or expired token');

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || !ADMIN_ROLES.includes(profile.role as any)) {
      throw new ForbiddenException('No admin access');
    }

    req.user = { id: profile.id, email: profile.email, role: profile.role };
    return true;
  }
}
```

**Rationale:** Mirrors the existing `AuthGuard` pattern but adds the role check. Failing the role check returns `403`, distinct from `401` for missing/invalid tokens — the admin frontend uses this to render a distinct error message.

**Client consistency note:** The existing `AuthGuard` uses `getClient()` (data client) for `auth.getUser(token)`. This is safe because `auth.getUser(token)` with an explicit token parameter does **not** contaminate the client's in-memory session — only `signInWithPassword` does. The `AdminAuthGuard` follows the same pattern for consistency.

### Step 2: `GET /api/admin/me`

**File:** `backend/src/admin/me.controller.ts`

Tiny controller used by the admin frontend right after login to verify role. If the user is not admin, this returns 403 and the frontend shows "no admin access".

```ts
@ApiTags('Admin')
@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class AdminMeController {
  @Get('me')
  me(@CurrentUser() user: { id: string; email: string; role: string }) {
    return user;
  }
}
```

### Step 3: `DashboardAdminController` + `DashboardAdminService`

**Files:** `backend/src/admin/dashboard-admin.controller.ts`, `dashboard-admin.service.ts`

**Endpoint:** `GET /api/admin/dashboard`

Returns aggregated stats from existing DB tables. No new tables needed.

```ts
@ApiTags('Admin')
@Controller('api/admin')
@UseGuards(AdminAuthGuard)
export class DashboardAdminController {
  constructor(private service: DashboardAdminService) {}

  @Get('dashboard')
  getStats() {
    return this.service.getStats();
  }
}
```

**Service:**

```ts
async getStats(): Promise<AdminDashboardStats> {
  const supabase = this.supabase.getClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  // Run all queries in parallel
  const [ordersToday, allOrders, topProducts, recentOrders, lowStockProducts] =
    await Promise.all([
      // Today's orders + revenue
      supabase
        .from('orders')
        .select('id, total')
        .gte('created_at', todayISO),

      // Orders by status (all time)
      supabase
        .from('orders')
        .select('status'),

      // Top selling products (by total quantity in order_items)
      supabase.rpc('get_top_selling_products', { limit_count: 5 }),

      // Recent 10 orders
      supabase
        .from('orders')
        .select('id, order_number, customer_name, total, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10),

      // Low stock products (stock_quantity <= 5 and active)
      supabase
        .from('products')
        .select('id, name_zh, stock_quantity')
        .eq('is_active', true)
        .lte('stock_quantity', 5)
        .order('stock_quantity', { ascending: true }),
    ]);

  const todayRevenue = (ordersToday.data ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0);
  const todayOrderCount = ordersToday.data?.length ?? 0;

  // Count orders by status
  const statusCounts: Record<string, number> = {};
  for (const o of allOrders.data ?? []) {
    statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
  }

  return {
    todayOrderCount,
    todayRevenue,
    pendingOrderCount: statusCounts['pending'] ?? 0,
    lowStockProductCount: lowStockProducts.data?.length ?? 0,
    ordersByStatus: statusCounts,
    topProducts: topProducts.data ?? [],
    recentOrders: recentOrders.data ?? [],
    lowStockProducts: lowStockProducts.data ?? [],
  };
}
```

**Note on `get_top_selling_products` RPC:** This requires a Supabase database function (see `database-schema.md` for the SQL). If the RPC is not yet created, fall back to a manual join query:

```ts
// Fallback without RPC:
const { data } = await supabase
  .from('order_items')
  .select('product_id, quantity, products(name_zh, image_url)')
  .order('quantity', { ascending: false });
// Then aggregate in JS by product_id, sum quantities, take top 5.
```

### Step 4: `ProductAdminController` + `ProductAdminService`

**Files:** `backend/src/admin/product-admin.controller.ts`, `product-admin.service.ts`

**Endpoints:**

- `GET /api/admin/products` — all rows (including `is_active=false`), newest first
- `POST /api/admin/products` — body: `CreateProductDto`
- `PATCH /api/admin/products/:id` — body: `UpdateProductDto` (all fields optional)
- `PATCH /api/admin/products/:id/stock` — body: `{ stock_quantity: number }` or `{ delta: number }`
- `DELETE /api/admin/products/:id` — hard delete; guarded

**Service highlights:**

```ts
async hardDelete(id: number) {
  const supabase = this.supabase.getClient();

  // Guard: refuse if any order_items reference this product
  const { count } = await supabase
    .from('order_items')
    .select('*', { head: true, count: 'exact' })
    .eq('product_id', id);

  if (count && count > 0) {
    throw new ConflictException('Product is referenced by existing orders. Use soft-delete (is_active=false) instead.');
  }

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

async updateStock(id: number, body: { stock_quantity?: number; delta?: number }) {
  const supabase = this.supabase.getClient();
  if (typeof body.stock_quantity === 'number') {
    const { data, error } = await supabase
      .from('products')
      .update({ stock_quantity: body.stock_quantity })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  // delta path — read-then-write (no atomic increment in PostgREST without RPC)
  const { data: current, error: readErr } = await supabase
    .from('products').select('stock_quantity').eq('id', id).single();
  if (readErr) throw readErr;
  const next = Math.max(0, current.stock_quantity + (body.delta ?? 0));
  const { data, error } = await supabase
    .from('products')
    .update({ stock_quantity: next })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

**Trade-off noted:** quick-stock via `delta` is a read-then-write that's not atomic. Acceptable for a single-operator tool. If contention becomes an issue, replace with a Supabase RPC that does `UPDATE products SET stock_quantity = GREATEST(0, stock_quantity + $1) ... RETURNING *`.

### Step 4: `ContentAdminController` + `ContentAdminService`

**Files:** `backend/src/admin/content-admin.controller.ts`, `content-admin.service.ts`

**Endpoints:**

- `GET /api/admin/site-content` → all override rows
- `PUT /api/admin/site-content/:key` → upsert `{ value_zh?, value_en? }`
- `DELETE /api/admin/site-content/:key` → remove override (revert to default)

**Service:** straightforward `upsert` / `delete` on the `site_content` table; `updated_by` set to the requesting admin's `user.id`.

### Step 6: `OrderAdminController` + `OrderAdminService`

**Files:** `backend/src/admin/order-admin.controller.ts`, `order-admin.service.ts`

**Endpoints:**

- `GET /api/admin/orders?status=&page=&pageSize=` → paginated list
- `GET /api/admin/orders/:id` → detail (same shape as customer-facing order detail, already in `OrderService`)
- `PATCH /api/admin/orders/:id/status` → body: `{ status: OrderStatus }`
- `POST /api/admin/orders/:id/resend-line` → reuses `LineService.sendOrderMessage(orderId)`

**Relaxed admin status transitions:**

The existing `OrderService.updateOrderStatus()` uses a strict state machine. The admin service uses a **relaxed version** — most transitions are allowed, but obviously invalid ones are blocked:

```ts
private static readonly ADMIN_BLOCKED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: [],                              // can go anywhere
  paid: [],                                 // can go anywhere
  preparing: [],                            // can go anywhere
  shipping: [],                             // can go anywhere
  delivered: ['pending', 'paid'],           // can't go back to unpaid states
  cancelled: ['delivered', 'shipping'],     // can't go directly to fulfilled states
};

async updateStatus(orderId: number, newStatus: OrderStatus) {
  const supabase = this.supabase.getClient();
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .single();

  if (fetchErr || !order) throw new NotFoundException('Order not found');
  if (order.status === newStatus) return order;

  const blocked = OrderAdminService.ADMIN_BLOCKED_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (blocked.includes(newStatus)) {
    throw new BadRequestException(
      `Cannot transition from '${order.status}' to '${newStatus}'`,
    );
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

**Rationale:** The customer-facing `OrderService` keeps its strict transitions for programmatic flows (e.g., checkout → paid). The admin gets a relaxed version because the owner may need to correct mistakes (e.g., move a paid order back to pending if payment bounces).

**Resend LINE:** import `LineService` from the existing `LineModule`; look up the order's `user_id`, pull the attached profile's `line_user_id`, check `canPushToUser` first, return a structured error if not friends.

### Step 7: `UploadAdminController` + `UploadAdminService`

**Files:** `backend/src/admin/upload-admin.controller.ts`, `upload-admin.service.ts`

**Endpoint:** `POST /api/admin/uploads/product-image`
**Body:** `{ filename: string; contentType: string; productId?: number }`
**Response:** `{ uploadUrl: string; publicUrl: string; path: string; token: string }`

```ts
async createSignedUploadUrl(input: { filename: string; contentType: string; productId?: number }) {
  const supabase = this.supabase.getClient();
  const bucket = this.config.get('SUPABASE_STORAGE_BUCKET', 'product-images');
  const ext = input.filename.split('.').pop() ?? 'jpg';
  const ts = Date.now();
  const path = input.productId
    ? `products/${input.productId}-${ts}.${ext}`
    : `products/draft-${ts}.${ext}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);
  if (error) throw error;

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { uploadUrl: data.signedUrl, path, token: data.token, publicUrl: pub.publicUrl };
}
```

**Why this shape:** the admin frontend does `PUT` directly to `uploadUrl` with the image bytes, then patches the product with `{ image_url: publicUrl }`. The backend never handles the binary, sidestepping Vercel function body limits.

**Old image cleanup:** When the admin updates a product's `image_url`, the `ProductAdminService.update()` method should delete the previous image from Supabase Storage before saving the new URL. This prevents orphaned files from accumulating.

```ts
// Inside ProductAdminService.update()
async update(id: number, dto: UpdateProductDto) {
  const supabase = this.supabase.getClient();

  // If image_url is changing, delete the old image from Storage
  if (dto.image_url) {
    const { data: existing } = await supabase
      .from('products')
      .select('image_url')
      .eq('id', id)
      .single();

    if (existing?.image_url && existing.image_url !== dto.image_url) {
      await this.deleteStorageImage(existing.image_url);
    }
  }

  const { data, error } = await supabase
    .from('products')
    .update(dto)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

private async deleteStorageImage(imageUrl: string) {
  try {
    const bucket = this.config.get('SUPABASE_STORAGE_BUCKET', 'product-images');
    // Extract storage path from the full public URL
    // URL format: https://<project>.supabase.co/storage/v1/object/public/product-images/<path>
    const url = new URL(imageUrl);
    const prefix = `/storage/v1/object/public/${bucket}/`;
    const storagePath = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length)
      : null;

    if (storagePath) {
      await this.supabase.getClient().storage.from(bucket).remove([storagePath]);
    }
  } catch (err) {
    // Log but don't fail the update — orphaned image is non-critical
    console.warn('Failed to delete old product image:', err);
  }
}
```

**Also on hard delete:** `ProductAdminService.hardDelete()` should delete the product image from Storage before deleting the DB row.

### Step 8: Public `GET /api/site-content`

**Files:** `backend/src/site-content/site-content.module.ts`, `site-content.controller.ts`, `site-content.service.ts`

Public, no guard. Returns all overrides keyed by `key`.

```ts
@ApiTags('SiteContent')
@Controller('api/site-content')
export class SiteContentController {
  constructor(private service: SiteContentService) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }
}
```

```ts
async getAll() {
  const { data, error } = await this.supabase.getClient()
    .from('site_content')
    .select('key, value_zh, value_en');
  if (error) throw error;
  return { overrides: data ?? [] };
}
```

### Step 9: DTOs (selected)

**File:** `backend/src/admin/dto/create-product.dto.ts`

```ts
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsString() name_zh!: string;
  @IsString() name_en!: string;
  @IsString() @IsOptional() description_zh?: string;
  @IsString() @IsOptional() description_en?: string;
  @IsInt() @Min(0) price!: number;
  @IsInt() @Min(0) stock_quantity!: number;
  @IsInt() category_id!: number;
  @IsString() @IsOptional() image_url?: string;
  @IsOptional() @IsIn(['hot', 'new', 'seasonal']) badge_type?: 'hot' | 'new' | 'seasonal';
  @IsOptional() specs?: Array<{ label_key: string; value_zh: string; value_en: string }>;
  @IsBoolean() @IsOptional() is_active?: boolean;
  @IsInt() @IsOptional() sort_order?: number;
}
```

`UpdateProductDto` is a `PartialType(CreateProductDto)` via `@nestjs/mapped-types`.

### Step 10: `AdminModule` wiring

**File:** `backend/src/admin/admin.module.ts`

```ts
@Module({
  imports: [OrderModule, LineModule],
  controllers: [
    AdminMeController,
    DashboardAdminController,
    ProductAdminController,
    ContentAdminController,
    OrderAdminController,
    UploadAdminController,
  ],
  providers: [
    AdminAuthGuard,
    DashboardAdminService,
    ProductAdminService,
    ContentAdminService,
    OrderAdminService,
    UploadAdminService,
  ],
})
export class AdminModule {}
```

`SupabaseModule` is global (per CLAUDE.md) — inject `SupabaseService` without importing.

### Step 11: CORS adjustment

**File:** `backend/src/main.ts`

Current CORS only allows `FRONTEND_URL`. Extend to accept both:

```ts
const allowed = [
  configService.get<string>('FRONTEND_URL'),
  configService.get<string>('ADMIN_FRONTEND_URL'),
].filter(Boolean);

app.enableCors({
  origin: (origin, cb) =>
    !origin || allowed.includes(origin) ? cb(null, true) : cb(new Error('CORS blocked')),
  credentials: true,
});
```

**Note:** the serverless entry (`backend/api/index.ts`) already uses `origin: true`, so Vercel deployments accept both domains out of the box.

### Step 12: Register `AdminModule` and `SiteContentModule`

**File:** `backend/src/app.module.ts`

Add `AdminModule` and `SiteContentModule` to `imports`.

## Testing Steps

1. `cd backend && npm run test` — unit tests for guards and services pass.
2. `AdminAuthGuard` tests:
   - No header → `UnauthorizedException`
   - Valid token, role=customer → `ForbiddenException`
   - Valid token, role=owner → attaches `req.user`, returns true
3. `ProductAdminService.hardDelete`:
   - Stubbed `order_items` with count=0 → deletes
   - Stubbed count>0 → `ConflictException`
4. E2E (`npm run test:e2e`):
   - `POST /api/admin/products` with no token → 401
   - with customer JWT → 403
   - with owner JWT → 201 and row persists
5. Manual: `curl http://localhost:3000/api/site-content` without auth returns `{ overrides: [...] }`.
6. Manual: `POST /api/admin/uploads/product-image` returns signed URL; `curl -X PUT` the URL with an image body → 200; object is visible in Supabase Storage.

## Dependencies

- **Depends on:** `database-schema.md` (all endpoints need `profiles.role`, `products.stock_quantity`, `site_content`)
- **Depends on:** `shared-types.md` (DTO contract + response types)
- **Blocks:** `admin-frontend.md` (admin frontend cannot ship without the endpoints)

## Notes

- All admin endpoints are `@ApiTags('Admin')` in Swagger — keeps the docs grouped and discoverable during development at `/api/docs`.
- If `LineService.canPushToUser` returns false on resend, return `409` with `{ reason: 'not_friend', add_friend_url }` so the admin UI can render an "ask owner to add friend" prompt.
- Throttling: consider wrapping `AdminAuthGuard` with `@nestjs/throttler` limits (e.g. 100 req/min/admin) — optional for a single-operator tool but cheap to add.
- Soft delete: `PATCH /api/admin/products/:id` with `{ is_active: false }` is the existing soft-delete path; no dedicated endpoint needed.
