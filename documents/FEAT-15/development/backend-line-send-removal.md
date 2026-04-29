# Implementation Plan: Remove `POST /api/orders/:id/line-send`

## Overview

Delete the dead, unauthenticated-by-ownership customer-facing LINE-send endpoint and detach its controller from the module graph. No replacement endpoint is introduced.

## Files to Modify

### Backend Changes

- `backend/src/line/line.controller.ts`
  - Delete the entire file.
  - Purpose: removes the `POST /api/orders/:id/line-send` route and its handler, which can be invoked by any authenticated user with any `orderId` and pushes order PII to both the shop OA and the caller's LINE.

- `backend/src/line/line.module.ts`
  - Remove the `LineController` import.
  - Remove `LineController` from the `controllers` array (the array becomes empty and can be deleted).
  - Purpose: detaches the deleted file from the Nest module graph.

### Frontend Changes

None — neither `frontend/` nor `admin-frontend/` imports or fetches this endpoint (verified by repo-wide grep for `line-send`, `lineSend`, `sendViaLine`, and `/api/orders/.*line`).

### Shared Types

None.

## Step-by-Step Implementation

### Step 1: Delete the controller file

**File:** `backend/src/line/line.controller.ts`

**Changes:** delete the file.

**Rationale:** the file's sole export is `LineController`, which has one route handler. Removing the file is the minimal change.

### Step 2: Update the module

**File:** `backend/src/line/line.module.ts`

**Before:**

```ts
import { Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { LineService } from './line.service';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [OrderModule],
  controllers: [LineController],
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}
```

**After:**

```ts
import { Module } from '@nestjs/common';
import { LineService } from './line.service';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [OrderModule],
  providers: [LineService],
  exports: [LineService],
})
export class LineModule {}
```

**Rationale:** Nest will fail to compile if `LineController` is referenced after the file is deleted. The module retains `LineService` as a provider+export — it is still consumed by `AuthModule` (LINE OAuth flow), `CheckoutModule` (`completePendingLineCheckout`), and `AdminModule` (`resendLine`).

### Step 3: Verify no other reference

Run from repo root:

```bash
grep -rn "LineController\|line.controller\|line-send" backend/src
```

Expected after deletion: zero matches (the only matches before deletion are inside `line.controller.ts` and `line.module.ts`).

## Testing Steps

1. `cd backend && npm run build` — TypeScript must compile cleanly.
2. `cd backend && npm run lint` — no lint regressions.
3. `cd backend && npx jest` — full unit test suite passes; no spec references `LineController`, so this should be a no-op.
4. `cd backend && npm run test:e2e` — confirm Nest app boots without the controller.
5. Manual API check (after deploy): `curl -X POST -H "Authorization: Bearer <jwt>" https://<host>/api/orders/46/line-send` should return 404. Before the change it returned 200 (or a structured 4xx).

## Dependencies

- Independent of the admin confirm-dialog change (`admin-resend-confirm-dialog.md`); the two can ship together or separately.

## Notes

- `LineService.sendOrderToAdmin` and `LineService.sendOrderMessage` are kept — both are still called from `CheckoutService` and `OrderAdminService.resendLine`.
- No DB migration. No env-var change. No changelog entry needed for an internal-only endpoint with no production callers.
- If a future feature needs a customer-triggered resend, it must be re-designed with: (a) ownership check on `req.user.id === order.user_id`, (b) explicit rate limit, (c) audit logging — none of which are in scope here.
