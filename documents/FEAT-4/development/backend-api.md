# Implementation Plan: Backend API

## Overview

This implementation covers the backend module work for secure cart contact-draft persistence.

The backend must provide one simple contract:

- `GET /api/cart/contact-draft`
- `PUT /api/cart/contact-draft`
- `DELETE /api/cart/contact-draft`

All three routes operate on the current `session_id` only. The browser never submits a client-generated draft ID.

## Files to Modify

### Backend Changes

- `backend/src/cart/cart-contact-draft.service.ts`
  - New service that owns draft read, upsert, expiry filtering, and deletion

- `backend/src/cart/dto/upsert-cart-contact-draft.dto.ts`
  - New DTO with per-field validation and length limits

- `backend/src/cart/cart.controller.ts`
  - Add `GET/PUT/DELETE contact-draft` endpoints

- `backend/src/cart/cart.module.ts`
  - Register and export the new draft service

- `backend/src/order/order.service.ts`
  - Clear the contact draft after successful order completion paths

- `backend/src/cart/cart.controller.spec.ts`
  - Extend controller coverage for the new endpoints

- `backend/src/order/order.service.spec.ts`
  - Add integration-level assertions that successful checkout clears the draft

- `backend/src/cart/cart-contact-draft.service.spec.ts`
  - New focused tests for expiry, upsert, and delete behavior

### Shared Types

- `shared/src/types/cart.ts`
  - Add `CartContactDraft` and `UpsertCartContactDraftRequest`

- `shared/src/index.ts`
  - Ensure the new cart draft types remain exported through the shared package

## Step-by-Step Implementation

### Step 1: Add shared request/response types

**Files:**

- `shared/src/types/cart.ts`
- `shared/src/index.ts`

**Changes:**

- Add a public type for the draft payload.

Suggested shape:

```ts
export interface CartContactDraft {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  notes: string;
  paymentMethod?: 'credit_card' | 'line_transfer';
  lineId: string;
}

export type UpsertCartContactDraftRequest = Partial<CartContactDraft>;
```

**Rationale:** The frontend and backend should agree on one transport shape for autosave and hydration.

### Step 2: Create a dedicated draft service

**File:** `backend/src/cart/cart-contact-draft.service.ts`

**Changes:**

- Introduce a new service instead of overloading `CartService`.

Suggested public methods:

```ts
getForSession(sessionId: string): Promise<CartContactDraft | null>
upsertForSession(sessionId: string, userId: string | undefined, dto: UpsertCartContactDraftDto): Promise<CartContactDraft>
clearForSession(sessionId: string): Promise<void>
```

Implementation details:

- filter reads with `expires_at > now()`
- map empty strings to `null` for DB storage
- trim incoming strings before persistence
- refresh `expires_at` to `now + 24h` on every upsert
- upsert by `session_id`

Concrete Supabase query patterns:

```ts
@Injectable()
export class CartContactDraftService {
  private static readonly DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly supabaseService: SupabaseService) {}

  async getForSession(sessionId: string): Promise<CartContactDraft | null> {
    const { data, error } = await this.supabaseService.client
      .from('checkout_contact_drafts')
      .select('*')
      .eq('session_id', sessionId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return this.mapToResponse(data);
  }

  async upsertForSession(
    sessionId: string,
    userId: string | undefined,
    dto: UpsertCartContactDraftDto,
  ): Promise<CartContactDraft> {
    const expiresAt = new Date(Date.now() + CartContactDraftService.DRAFT_TTL_MS).toISOString();

    const record = {
      session_id: sessionId,
      user_id: userId ?? null,
      customer_name: this.normalizeField(dto.customerName),
      customer_phone: this.normalizeField(dto.customerPhone),
      customer_email: this.normalizeField(dto.customerEmail),
      customer_address: this.normalizeField(dto.customerAddress),
      notes: this.normalizeField(dto.notes),
      payment_method: dto.paymentMethod ?? null,
      line_id: this.normalizeField(dto.lineId),
      expires_at: expiresAt,
    };

    const { data, error } = await this.supabaseService.client
      .from('checkout_contact_drafts')
      .upsert(record, { onConflict: 'session_id' })
      .select()
      .single();

    if (error) throw error;
    return this.mapToResponse(data);
  }

  async clearForSession(sessionId: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('checkout_contact_drafts')
      .delete()
      .eq('session_id', sessionId);

    if (error) throw error;
  }

  private normalizeField(value: string | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private mapToResponse(row: any): CartContactDraft {
    return {
      customerName: row.customer_name ?? '',
      customerPhone: row.customer_phone ?? '',
      customerEmail: row.customer_email ?? '',
      customerAddress: row.customer_address ?? '',
      notes: row.notes ?? '',
      paymentMethod: row.payment_method ?? undefined,
      lineId: row.line_id ?? '',
    };
  }
}
```

**Note:** The draft is independent of cart existence. A user may start typing customer info before adding any items to the cart. As long as `session_id` exists (created by `SessionMiddleware`), the draft is valid.

**Rationale:** This isolates mutable cart-contact state from cart-line state. The draft lifecycle is different enough that it deserves its own service boundary.

### Step 3: Add a strict DTO for allowed fields

**File:** `backend/src/cart/dto/upsert-cart-contact-draft.dto.ts`

**Changes:**

- Define only the fields that the frontend is allowed to save.
- Add conservative limits to prevent abuse.

Suggested validation direction:

- `customerName`: optional string, `MaxLength(100)`
- `customerPhone`: optional string, `MaxLength(30)`
- `customerEmail`: optional string, `MaxLength(254)` — **no `@IsEmail()`**
- `customerAddress`: optional string, `MaxLength(500)`
- `notes`: optional string, `MaxLength(1000)`
- `paymentMethod`: optional enum `'credit_card' | 'line_transfer'`
- `lineId`: optional string, `MaxLength(100)`

**Important: Do not use `@IsEmail()` on the draft DTO.** The draft stores in-progress form state, including partially typed values like `"jan"` in the email field. Format validation belongs only on the final checkout submission (`CreateOrderDto`), not on the autosaved draft. The draft DTO should enforce only length limits.

Concrete DTO implementation:

```ts
import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';

export class UpsertCartContactDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(['credit_card', 'line_transfer'])
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lineId?: string;
}
```

**Rationale:** This endpoint is autosaved frequently and stores PII. It needs explicit field bounds, not an untyped `Record<string, unknown>`. But it must not reject partially typed values that would fail format validators like `@IsEmail()`.

### Step 4: Add cart contact-draft endpoints

**File:** `backend/src/cart/cart.controller.ts`

**Changes:**

- Keep `OptionalAuthGuard`
- Add:

```ts
@Get('contact-draft')
getContactDraft(@Req() req: Request)

@Put('contact-draft')
updateContactDraft(@Req() req: Request, @Body() dto: UpsertCartContactDraftDto)

@Delete('contact-draft')
clearContactDraft(@Req() req: Request)
```

Recommended hardening:

- add a route-level `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` for the `PUT` endpoint
- return `null` from `GET` when no draft exists or it is expired
- require `req.sessionId` exactly as current cart routes do

**Rationale:** Global validation currently strips unknown keys, but this endpoint should reject unexpected input rather than silently ignoring it.

### Step 5: Export the new service from the cart module

**File:** `backend/src/cart/cart.module.ts`

**Changes:**

- Register `CartContactDraftService` in `providers`
- Add `CartContactDraftService` to `exports`

```ts
@Module({
  controllers: [CartController],
  providers: [CartService, CartContactDraftService],
  exports: [CartService, CartContactDraftService],
})
export class CartModule {}
```

**Note:** `OrderModule` already imports `CartModule`, so no additional module import is needed in `order.module.ts`. Adding `CartContactDraftService` to `CartModule.exports` is sufficient for `OrderService` to inject it.

**Rationale:** Checkout completion happens outside the cart controller, so the draft-clear operation must be available to order logic.

### Step 6: Clear the draft after successful checkout completion

**File:** `backend/src/order/order.service.ts`

**Changes:**

- Inject `CartContactDraftService`
- After successful `createOrder()` when `skip_cart_clear` is false:
  - clear the cart
  - clear the contact draft
- After successful `confirmOrder()`:
  - clear the cart
  - clear the contact draft

Recommended flow:

```ts
if (!dto.skip_cart_clear) {
  await this.cartService.clearCart(sessionId, userId || undefined);
  await this.cartContactDraftService.clearForSession(sessionId);
}
```

and

```ts
await this.cartService.clearCart(sessionId, userId || undefined);
await this.cartContactDraftService.clearForSession(sessionId);
```

**Rationale:** The server, not the browser, should be the authoritative place that deletes the draft on success.

### Step 7: Do not couple this feature to `pending_line_orders`

**Files:**

- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`

**Changes:**

- No direct changes required for phase 1.
- Keep `pending_line_orders` as the submit-time checkout mechanism.

**Rationale:** The cart contact draft is earlier and mutable. The pending order is later and checkout-specific. Mixing them would create confusing retention and lifecycle rules.

### Step 8: Add focused tests

**Files:**

- `backend/src/cart/cart-contact-draft.service.spec.ts`
- `backend/src/cart/cart.controller.spec.ts`
- `backend/src/order/order.service.spec.ts`

**Changes:**

- Add service tests for:
  - read returns `null` when missing
  - read ignores expired rows
  - upsert refreshes `expires_at`
  - whitespace-only fields normalize to `null`
  - delete removes the session draft

- Add controller tests for:
  - `GET /contact-draft` delegates by `sessionId`
  - `PUT /contact-draft` passes `sessionId`, optional `user.id`, and DTO to the service
  - `DELETE /contact-draft` clears the correct session

- Add order-service tests for:
  - successful direct checkout clears the contact draft
  - successful LINE confirmation clears the contact draft
  - failed order creation does not clear the draft prematurely

**Rationale:** The failure mode here is not only data loss. It is also data lingering when it should have been deleted.

## Testing Steps

1. Run the cart draft service tests and confirm expiry filtering and upsert behavior.
2. Run the cart controller tests and confirm the new endpoints use the current session identity.
3. Run the order service tests and confirm successful checkout paths clear the draft.
4. Manually verify:
   - `GET /api/cart/contact-draft` returns `null` before any save
   - `PUT /api/cart/contact-draft` creates or updates the row
   - `DELETE /api/cart/contact-draft` removes it
   - successful checkout removes the row server-side

## Dependencies

- Must complete before: frontend hydration/autosave work
- Depends on: `checkout_contact_drafts` table and shared types

## Notes

- Do not add request-body debug logging to these endpoints.
- Keep the API same-origin and cookie-based. Do not introduce client-visible draft IDs.
- If later security requirements increase, this service is the correct place to add field-level encryption without changing the frontend contract.
- **Response format:** Follow the existing project convention — return raw objects directly (no `{ data: ... }` wrapper). `GET` returns `CartContactDraft` or `null`. `PUT` returns the updated `CartContactDraft`. `DELETE` returns `204 No Content`.
