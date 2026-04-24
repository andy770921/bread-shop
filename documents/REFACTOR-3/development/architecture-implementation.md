# REFACTOR-3: Architecture Implementation Plan

Step-by-step guide for implementing the improvements identified in `architecture-review.md`. Each step is intended to be independently committable and testable.

**Guiding principles:**

- Prefer small, shippable extractions over broad module churn.
- Move reads and writes behind clear owners before introducing larger orchestrators.
- Use stable file and method names in the plan instead of line numbers, because these flows are already moving targets.

---

## Phase 1: Quick Wins (Low Risk, Low Effort)

### Step 1.1: Remove Dead Auth Helpers

**What:** Delete dead frontend auth helper files after verifying they are truly unused.

**Why:** The current tree appears to have two dead helpers:

- `frontend/src/lib/api.ts` — duplicates auth header construction
- `frontend/src/lib/api-client.ts` — health-only wrapper that appears unreferenced

Dead helpers create ambiguity about which auth and fetch path is canonical.

**How:**

1. Grep for imports of `@/lib/api`, `@/lib/api-client`, `lib/api`, and `lib/api-client`
2. If no imports exist, delete `frontend/src/lib/api.ts`
3. If no imports exist, delete `frontend/src/lib/api-client.ts`
4. Run the frontend build to confirm nothing relies on them indirectly

**Files changed:**

- `frontend/src/lib/api.ts` (delete)
- `frontend/src/lib/api-client.ts` (delete, if still unused)

---

### Step 1.2: Extract Shared Business Constants

**What:** Create a shared constants file for business rules that are duplicated across backend and frontend.

**Why:** Shipping threshold (500), shipping fee (60), and quantity cap (99) are hardcoded in multiple places. Changing one copy without the other will create drift.

**How:**

1. Create `shared/src/constants/cart.ts`:
   ```typescript
   export const CART_CONSTANTS = {
     FREE_SHIPPING_THRESHOLD: 500,
     SHIPPING_FEE: 60,
     MAX_ITEM_QUANTITY: 99,
   } as const;
   ```
2. Export it from `shared/src/index.ts`
3. Update `backend/src/cart/cart.service.ts` to use `CART_CONSTANTS.FREE_SHIPPING_THRESHOLD` and `CART_CONSTANTS.SHIPPING_FEE`
4. Update `backend/src/auth/auth.service.ts` to use `CART_CONSTANTS.MAX_ITEM_QUANTITY`
5. Update `frontend/src/queries/use-cart.ts` to use the same constants
6. Run frontend and backend tests or builds

**Files changed:**

- `shared/src/constants/cart.ts` (new)
- `shared/src/index.ts` (add export)
- `backend/src/cart/cart.service.ts`
- `backend/src/auth/auth.service.ts`
- `frontend/src/queries/use-cart.ts`

---

### Step 1.3: Deduplicate Session Expiry Constant

**What:** Extract the 90-day session expiry into a constant inside `SessionMiddleware`.

**Why:** `90 * 24 * 60 * 60 * 1000` currently appears twice in the same file.

**How:**

1. Add a private class constant:
   ```typescript
   private readonly SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
   ```
2. Replace both inline occurrences with `this.SESSION_MAX_AGE_MS`
3. Run backend tests

**Files changed:**

- `backend/src/common/middleware/session.middleware.ts`

---

## Phase 2: Consolidate Order Reads and Writes (Medium Risk, Low-Medium Effort)

### Step 2.1: Route Order Reads Through OrderService

**What:** Make `LineService` and `PaymentService` use `OrderService` for order reads instead of querying Supabase directly.

**Why:** The same `orders + order_items` query is duplicated across multiple modules. `OrderService` should be the single read boundary for loaded order aggregates.

**How:**

1. Add a method to `OrderService`:

   ```typescript
   async getOrderWithItems(orderId: number): Promise<Order> {
     const supabase = this.supabaseService.getClient();
     const { data, error } = await supabase
       .from('orders')
       .select('*, items:order_items(*)')
       .eq('id', orderId)
       .single();

     if (error || !data) throw new NotFoundException('Order not found');
     return data;
   }
   ```

2. Refactor `getOrderById()` to reuse `getOrderWithItems()` and keep ownership checks in one place
3. Update `LineService.sendOrderToAdmin()` to call `orderService.getOrderWithItems(orderId)`
4. Update `LineService.sendOrderMessage()` the same way
5. Update `PaymentService.createCheckout()` to read through `OrderService`, then apply session or user ownership checks locally
6. Import `OrderModule` into `LineModule` and `PaymentModule`
7. Run backend tests

**Files changed:**

- `backend/src/order/order.service.ts`
- `backend/src/order/order.module.ts`
- `backend/src/line/line.service.ts`
- `backend/src/line/line.module.ts`
- `backend/src/payment/payment.service.ts`
- `backend/src/payment/payment.module.ts`

---

### Step 2.2: Centralize Order Status Transitions

**What:** Add an `updateOrderStatus()` method to `OrderService` that validates legal transitions before mutating `orders.status`.

**Why:** `PaymentService` currently writes `paid` and `cancelled` directly. The shared `OrderStatus` union already includes `preparing` and `shipping`, so the backend needs a lifecycle owner aligned with that type.

**How:**

1. Import the shared `OrderStatus` type into `OrderService`
2. Define a transition map aligned with the current shared union:
   ```typescript
   private static readonly VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
     pending: ['paid', 'cancelled'],
     paid: ['preparing', 'cancelled'],
     preparing: ['shipping', 'cancelled'],
     shipping: ['delivered'],
     delivered: [],
     cancelled: [],
   };
   ```
3. Add:

   ```typescript
   async updateOrderStatus(
     orderId: number,
     newStatus: OrderStatus,
     extra?: Record<string, unknown>,
   ): Promise<void> {
     const order = await this.getOrderWithItems(orderId);
     const validNext = OrderService.VALID_TRANSITIONS[order.status] ?? [];

     if (!validNext.includes(newStatus)) {
       throw new BadRequestException(
         `Cannot transition from '${order.status}' to '${newStatus}'`,
       );
     }

     await this.supabaseService
       .getClient()
       .from('orders')
       .update({ status: newStatus, ...extra })
       .eq('id', orderId);
   }
   ```

4. Update `PaymentService.handleWebhook()` to call `orderService.updateOrderStatus(orderId, 'paid', { payment_id: lsOrderId })`
5. Update refund handling to call `orderService.updateOrderStatus(orderId, 'cancelled')`
6. Add unit tests for legal and illegal transitions
7. Run backend tests

**Note:** If the admin fulfillment steps (`preparing`, `shipping`, `delivered`) are not implemented yet, still keep the transition map aligned with the shared type so the backend does not introduce a second lifecycle vocabulary.

**Files changed:**

- `backend/src/order/order.service.ts`
- `backend/src/payment/payment.service.ts`
- `shared/src/types/order.ts` (only if the union itself needs to be revised)

---

### Step 2.3: Move Direct Order Metadata Writes Behind OrderService

**What:** Replace raw `orders` updates in `AuthController` and `LineService` with explicit `OrderService` methods.

**Why:** Status is not the only ownership problem. The current code also mutates `orders.user_id` and `orders.line_user_id` outside the order module.

**How:**

1. Add methods to `OrderService`:
   ```typescript
   async assignUserToOrder(orderId: number, userId: string): Promise<void> { ... }
   async attachLineUserId(orderId: number, lineUserId: string): Promise<void> { ... }
   ```
2. Replace the raw update in `AuthController.handlePendingOrder()` with `orderService.assignUserToOrder(...)`
3. Replace the raw update in `LineService.sendOrderMessage()` with `orderService.attachLineUserId(...)`
4. Remove no-longer-needed direct `orders` writes from those modules
5. Run backend tests

**Files changed:**

- `backend/src/order/order.service.ts`
- `backend/src/auth/auth.controller.ts`
- `backend/src/line/line.service.ts`

---

## Phase 3: Extract Pending-Order Checkout Orchestrator (Medium-High Risk, Medium Effort)

### Step 3.1: Create CheckoutService for Pending-Order Completion

**What:** Extract the body of `handlePendingOrder()` into a dedicated `CheckoutService` that owns pending-order completion after LINE authentication.

**Why:** The hardest part of the LINE checkout flow is not the OAuth callback itself; it is the pending-order completion sequence that creates the order, merges sessions, sends notifications, and clears the cart. That sequence is currently shared by both `lineCallback()` and `confirmLineOrder()`.

**How:**

1. Create `backend/src/checkout/checkout.service.ts`:

   ```typescript
   @Injectable()
   export class CheckoutService {
     constructor(
       private readonly orderService: OrderService,
       private readonly authService: AuthService,
       private readonly lineService: LineService,
       private readonly supabaseService: SupabaseService,
     ) {}

     async completePendingLineCheckout(params: {
       pending: { session_id: string; form_data: Record<string, unknown> };
       authResult: {
         user: { id: string; email: string };
         access_token?: string;
         refresh_token?: string;
       };
       frontendUrl: string;
     }): Promise<string> {
       // create order
       // assign user
       // merge sessions
       // send notifications
       // confirm order
       // build redirect URL
     }
   }
   ```

2. Register `CheckoutService` in `AuthModule` first instead of introducing a separate module immediately
3. Move the body of `AuthController.handlePendingOrder()` into `CheckoutService.completePendingLineCheckout()`
4. Replace both call sites:
   - `AuthController.lineCallback()`
   - `AuthController.confirmLineOrder()`
5. Keep `OrderService` in `AuthController` for `lineStart()` unless pending-order preparation is also extracted in the same commit
6. Keep `sendLoadingPage()` in the controller for now; it is an HTTP concern, not a checkout-domain concern
7. Run backend tests and manually test both flows:
   - callback path after successful LINE login
   - pending confirmation page path after add-friend flow

**Files changed:**

- `backend/src/checkout/checkout.service.ts` (new)
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.module.ts`

---

### Step 3.2: Write Boundary Tests for CheckoutService

**What:** Add unit tests for the extracted checkout orchestration service.

**Why:** The current controller tests verify redirects and entrypoint behavior, but they do not give a stable unit boundary for the orchestration itself.

**How:**

1. Create `backend/src/checkout/checkout.service.spec.ts`
2. Mock `OrderService`, `AuthService`, `LineService`, and `SupabaseService`
3. Cover:
   - Happy path: order created, user assigned, session merged, LINE sent, order confirmed
   - Admin or customer LINE send failure: order still completes
   - Order creation failure: session merge is not attempted
   - Confirm failure: treated as non-critical
4. Keep `auth.controller.spec.ts` focused on HTTP concerns such as redirect targets and pending-order guards
5. Run backend tests

**Files changed:**

- `backend/src/checkout/checkout.service.spec.ts` (new)
- `backend/src/auth/auth.controller.spec.ts` (optional cleanup after extraction)

---

## Phase 4: Frontend Cart State Machine Extraction (Medium Risk, Medium Effort)

### Step 4.1: Extract Cart Reconciliation as Pure Functions

**What:** Move `recalcCartTotals()`, `reconcileWithPending()`, and `applyPendingUpdates()` out of `use-cart.ts` into a standalone utility module.

**Why:** These functions are pure logic but currently live in a React hook file, which makes them harder to unit test and reuse.

**How:**

1. Create `frontend/src/utils/cart-math.ts`
2. Move the three pure functions into that file
3. Reuse shared cart constants from Phase 1.2
4. Update `use-cart.ts` to import the functions
5. Run the frontend build and tests

**Files changed:**

- `frontend/src/utils/cart-math.ts` (new)
- `frontend/src/queries/use-cart.ts`

---

### Step 4.2: Write Unit Tests for Cart Math

**What:** Add tests for the extracted cart math utilities.

**Why:** The reconciliation logic handles race conditions and optimistic edge cases that are currently hard to verify.

**How:**

1. Create `frontend/src/utils/cart-math.spec.ts`
2. Test `recalcCartTotals()` for empty, under-threshold, and free-shipping cases
3. Test `reconcileWithPending()` for:
   - no pending entries
   - pending quantity on an existing product
   - optimistic-only items missing from a stale server response
4. Test `applyPendingUpdates()` for absolute quantity overrides
5. Run frontend tests

**Files changed:**

- `frontend/src/utils/cart-math.spec.ts` (new)

---

### Step 4.3: Extract Debounced Cart Mutation Pattern

**What:** Create a reusable hook for the shared debounce and reconciliation behavior in `useAddToCart()` and `useUpdateCartItem()`.

**Why:** Both hooks still duplicate most of the same timer-driven mutation pattern.

**How:**

1. Create `frontend/src/queries/use-debounced-cart-mutation.ts`
2. Move the shared pending-map, server snapshot, debounce timer, and reconciliation workflow there
3. Rebuild `useAddToCart()` on top of the shared hook
4. Rebuild `useUpdateCartItem()` on top of the shared hook
5. Verify behavior manually in the browser with rapid quantity changes
6. Run frontend tests and build

**Files changed:**

- `frontend/src/queries/use-debounced-cart-mutation.ts` (new)
- `frontend/src/queries/use-cart.ts`

**Risk:** This is one of the highest-risk frontend refactors because the debounce behavior is user-facing and timing-sensitive.

---

## Phase 5: Clean Up Auth Token Lifecycle (Low Risk, Low Effort)

### Step 5.1: Remove Auth Context's Direct Query Cache Coupling

**What:** Stop having `AuthProvider` directly call `queryClient.invalidateQueries({ queryKey: ['cart'] })`.

**Why:** Auth state should not need to know concrete query keys. Otherwise every auth-driven invalidation turns into more coupling inside the auth layer.

**How:**

1. Add an `onAuthChange` callback prop to `AuthProvider`, or move auth-driven invalidations into a query-key registry helper
2. In `frontend/src/app/providers.tsx`, wire that callback to the query client
3. Replace direct invalidation calls in `auth-context.tsx`
4. Run the frontend build and test login/logout manually

**Files changed:**

- `frontend/src/lib/auth-context.tsx`
- `frontend/src/app/providers.tsx`

**Alternative:** If a callback feels too abstract for the current codebase, create `frontend/src/queries/query-keys.ts` and centralize invalidation targets there first.

---

### Step 5.2: Unify Token Read and Write Paths

**What:** Make `AuthProvider` and `authedFetchFn()` use the same token storage helper instead of each reading `localStorage` independently.

**Why:** The current code has two token readers. That is the core fragmentation problem, not just the query invalidation coupling.

**How:**

1. Create `frontend/src/lib/auth-token-store.ts`:
   ```typescript
   export const authTokenStore = {
     get(): string | null { ... },
     set(token: string | null): void { ... },
   };
   ```
2. Update `AuthProvider` to read and write tokens through that helper
3. Update `authedFetchFn()` to read tokens through the same helper
4. If needed, add a `storage` event listener so multi-tab token changes stay coherent
5. Run login, logout, and auth-callback flows manually

**Files changed:**

- `frontend/src/lib/auth-token-store.ts` (new)
- `frontend/src/lib/auth-context.tsx`
- `frontend/src/utils/fetchers/fetchers.client.ts`

---

## Phase 6: Extract Frontend Checkout Flow (Medium Risk, Medium Effort)

### Step 6.1: Extract Checkout Form Schema and Mapping

**What:** Move the inline cart-page schema and request-shape mapping into a dedicated checkout module.

**Why:** `cartFormSchema` and the `CartFormValues -> CreateOrderRequest` mapping are page-owned today, which makes them hard to reuse and awkward to test.

**How:**

1. Create `frontend/src/features/checkout/cart-form.ts`
2. Move:
   - `paymentMethods`
   - `cartFormSchema`
   - `CartFormValues`
   - helper(s) that map form values to API payloads
3. Update `frontend/src/app/cart/page.tsx` to import them
4. Add focused unit tests for validation branches

**Files changed:**

- `frontend/src/features/checkout/cart-form.ts` (new)
- `frontend/src/app/cart/page.tsx`
- `frontend/src/features/checkout/cart-form.spec.ts` (new)

---

### Step 6.2: Create a Checkout Flow Coordinator Hook

**What:** Move the page-level checkout decision tree into a dedicated hook, such as `useCheckoutFlow()`.

**Why:** `use-checkout.ts` currently owns transport only, while `page.tsx` still owns policy: payment branching, LINE pending-order redirect, create -> send -> confirm sequencing, toasts, navigation, and cart invalidation.

**How:**

1. Create `frontend/src/features/checkout/use-checkout-flow.ts`
2. Move the current `onSubmit()` orchestration into the hook
3. Keep the hook responsible for:
   - selecting the backend payment method
   - handling the LINE-login pending flow
   - sequencing create -> LINE send -> confirm
   - deciding when to invalidate `['cart']`
   - returning user-facing errors in a consistent shape
4. Reduce `page.tsx` to form rendering and event wiring
5. Run browser verification for both LINE and non-LINE flows

**Files changed:**

- `frontend/src/features/checkout/use-checkout-flow.ts` (new)
- `frontend/src/app/cart/page.tsx`

---

### Step 6.3: Add Branch Coverage for Checkout Flow

**What:** Add tests around the coordinator hook or extracted helper functions.

**Why:** The checkout page currently encodes multiple mutually exclusive branches:

- LINE without linked user
- LINE with linked user
- LINE send failure requiring add-friend
- normal checkout success

**How:**

1. Test the extracted flow helpers or hook with mocked mutations
2. Verify the correct branch is chosen for each payment and identity scenario
3. Verify cart invalidation and navigation side effects
4. Run frontend tests

**Files changed:**

- `frontend/src/features/checkout/use-checkout-flow.spec.ts` (new)

---

## Execution Order

```text
Phase 1 (Quick Wins) — can be done independently, in any order
  1.1 Remove dead auth helpers
  1.2 Extract shared business constants
  1.3 Deduplicate session expiry constant

Phase 2 (Consolidate Order Reads and Writes) — sequential within phase
  2.1 Route order reads through OrderService
  2.2 Centralize order status transitions
  2.3 Move direct order metadata writes behind OrderService

Phase 3 (Pending-Order Checkout Orchestrator) — depends on 2.1 and 2.3
  3.1 Create CheckoutService
  3.2 Write boundary tests for CheckoutService

Phase 4 (Frontend Cart) — independent of Phases 2-3
  4.1 Extract cart reconciliation as pure functions
  4.2 Write unit tests for cart math
  4.3 Extract debounced cart mutation pattern

Phase 5 (Auth Token Lifecycle) — independent of backend phases
  5.1 Remove auth context's direct query-cache coupling
  5.2 Unify token read and write paths

Phase 6 (Frontend Checkout Flow) — can run after Phase 1, independent of backend phases
  6.1 Extract checkout form schema and mapping
  6.2 Create checkout flow coordinator hook
  6.3 Add branch coverage for checkout flow
```

**Parallelism:** Phase 1, Phase 4, Phase 5, and Phase 6 can mostly run in parallel. Phase 2 should land before Phase 3 so the checkout orchestrator can depend on stable order read and write boundaries.

---

## Risks and Mitigations

| Risk                                                                             | Mitigation                                                                                          |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| LINE checkout regression after orchestration extraction (Phase 3 / Phase 6)      | Manually test both callback and pending-confirmation flows end to end                               |
| Cart optimistic update regression (Phase 4.3)                                    | Browser-test rapid add/update/remove actions before and after refactor                              |
| Shared package import breakage (Phase 1.2)                                       | Run workspace builds after changing `@repo/shared` exports                                          |
| Auth state desync after token unification (Phase 5)                              | Test login, logout, auth callback, and multi-tab behavior                                           |
| Order lifecycle map diverges from shared `OrderStatus` union (Phase 2.2)         | Keep the transition map typed against `OrderStatus` and test illegal transitions                    |
| Optional future module extraction for `CheckoutService` introduces circular deps | First land the service as an `AuthModule` provider; only split modules after the boundary is stable |
