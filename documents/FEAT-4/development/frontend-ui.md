# Implementation Plan: Frontend UI

## Overview

This implementation covers cart-page hydration, autosave, and client-side cache hygiene for the new server-side contact draft.

The frontend goal is:

1. restore saved values when the user returns to `/cart`
2. autosave edits without using `sessionStorage` or `localStorage`
3. flush pending autosave before the explicit "Continue Shopping" navigation
4. clear local draft cache after successful checkout

## Files to Modify

### Frontend Changes

- `frontend/src/queries/query-keys.ts`
  - Add a query key for the contact draft

- `frontend/src/lib/auth-context.tsx`
  - Invalidate the contact-draft query on login, register, and logout

- `frontend/src/queries/use-cart-contact-draft.ts`
  - New query/mutation hooks for `GET/PUT/DELETE /api/cart/contact-draft`

- `frontend/src/features/checkout/cart-contact-draft.ts`
  - New helper module for mapping form values to persisted draft payloads

- `frontend/src/features/checkout/use-cart-contact-draft-sync.ts`
  - New hydration + debounced autosave hook

- `frontend/src/app/cart/page.tsx`
  - Use the new sync hook
  - Replace the passive `Link`-only continue-shopping path with an explicit flush-then-navigate flow

- `frontend/src/features/checkout/use-checkout-flow.ts`
  - Clear the local draft query cache after successful checkout

- `frontend/src/app/cart/page.spec.tsx`
  - Add restore/autosave/flush behavior tests

- `frontend/src/features/checkout/use-checkout-flow.spec.ts`
  - Assert that successful checkout clears the draft query cache

- `frontend/src/queries/use-cart-contact-draft.spec.tsx`
  - New tests for query/mutation cache behavior

### Shared Types

- `shared/src/types/cart.ts`
  - Consume the new draft request/response types

## Step-by-Step Implementation

### Step 1: Add a query key for the draft

**File:** `frontend/src/queries/query-keys.ts`

**Changes:**

- Add:

```ts
cartContactDraft: ['cart-contact-draft'] as const
```

- Include it in `invalidateAuthQueries()`

**Rationale:** Login/logout/register already invalidate cart-related session state. The draft cache should follow the same discipline so stale session data is not kept around longer than necessary.

### Step 2: Create cart contact-draft query hooks

**File:** `frontend/src/queries/use-cart-contact-draft.ts`

**Changes:**

- Add three hooks:

```ts
useCartContactDraft()
useUpsertCartContactDraft()
useClearCartContactDraft()
```

Recommended behavior:

- `useCartContactDraft`
  - `GET /api/cart/contact-draft`
  - returns `CartContactDraft | null`

- `useUpsertCartContactDraft`
  - `PUT /api/cart/contact-draft`
  - on success: `setQueryData(QUERY_KEYS.cartContactDraft, data)`

- `useClearCartContactDraft`
  - `DELETE /api/cart/contact-draft`
  - on success: `setQueryData(QUERY_KEYS.cartContactDraft, null)`

**Session bootstrap:** The draft query does **not** need an explicit `enabled` condition. Follow the same pattern as `useCart` — the fetch function should internally wait for `cartSessionReady` (via `ensureCartSessionReady()` from `cart-session.ts`) before making the request. This ensures the `session_id` cookie is established before the GET fires.

**Error handling for mutations:** Autosave mutations (`useUpsertCartContactDraft`) must **not** show error toasts or disrupt the user's typing flow. Failures should be silent — the user will not lose data because the form state is still in memory. The next debounce cycle or explicit flush will retry.

**Rationale:** Autosave should not invalidate and refetch on every keystroke. The mutation result can update the cache directly.

### Step 3: Create a helper for persisted fields only

**File:** `frontend/src/features/checkout/cart-contact-draft.ts`

**Changes:**

- Add helpers that isolate the persisted subset of `CartFormValues`.

Suggested helpers:

```ts
toCartContactDraft(values: CartFormValues): UpsertCartContactDraftRequest
isCartContactDraftEmpty(payload: UpsertCartContactDraftRequest): boolean
mergeCartContactDraftIntoFormValues(draft: CartContactDraft | null): CartFormValues
```

Important rules:

- trim strings
- do not persist unknown fields
- if every persisted field is empty, treat the draft as empty and delete it instead of saving an empty row

**Rationale:** The cart page should not manually duplicate field-selection logic in several effects.

### Step 4: Create a sync hook for hydration and autosave

**File:** `frontend/src/features/checkout/use-cart-contact-draft-sync.ts`

**Changes:**

- Create a hook that accepts the cart form instance and returns:

```ts
{
  isDraftHydrating: boolean;
  flushDraftNow: () => Promise<void>;
}
```

Recommended responsibilities:

1. load the server-side draft on mount
2. hydrate the form once
3. debounce autosave while the user edits
4. avoid saving immediately after hydration
5. expose an explicit flush method for navigation actions

Recommended implementation details:

- keep a `hydratedRef` or similar guard so server data is applied only once
- do not overwrite the form after the user has started typing
- debounce saves by roughly `500-1000ms`
- keep a `latestPayloadRef` so `flushDraftNow()` can persist the latest values immediately

**`visibilitychange` listener:** The sync hook should flush pending changes when the tab goes hidden. This covers cases where the user switches tabs or minimizes the browser without clicking a navigation button:

```ts
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushDraftNow();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, [flushDraftNow]);
```

**Route-leave limitation:** In Next.js App Router, there is no reliable interceptor for all client-side navigations (clicking nav links, browser back button). The explicit flush on "Continue Shopping" and the `visibilitychange` listener cover the two most common exit paths. Other navigations rely on the debounce timer having already fired. This is acceptable for phase 1.

**Rationale:** This is the main deep frontend module for the feature. Without it, `page.tsx` will accumulate fragile form+network orchestration logic.

### Step 5: Integrate the sync hook into `/cart`

**File:** `frontend/src/app/cart/page.tsx`

**Changes:**

- Use the new hook after `useForm()`
- Gate form interactivity on both:
  - existing cart synchronization
  - draft hydration completion

Suggested behavior:

- when draft hydration is still in progress, keep checkout controls disabled
- after hydration finishes, form behaves normally

**Rationale:** If the page allows typing before draft hydration resolves, the later `form.reset()` can clobber user input or trigger an accidental empty autosave race.

### Step 6: Flush before "Continue Shopping"

**File:** `frontend/src/app/cart/page.tsx`

**Changes:**

- The current "Continue Shopping" button is at **lines 503-508** and uses a passive `<Link href="/">` wrapper:

```tsx
{/* Current implementation */}
<Link href="/">
  <Button variant="ghost" size="sm">
    &larr; {t('cart.continueShopping')}
  </Button>
</Link>
```

- Replace with an explicit flush-then-navigate handler. This requires `useRouter` from `next/navigation`:

```tsx
const router = useRouter();

const handleContinueShopping = async () => {
  await flushDraftNow();
  router.push('/');
};

{/* Updated implementation */}
<Button variant="ghost" size="sm" onClick={handleContinueShopping}>
  &larr; {t('cart.continueShopping')}
</Button>
```

- Keep the visual styling the same, but make the action deterministic.

**Rationale:** The reported regression is specifically triggered by clicking "Continue Shopping". A debounce-only autosave is not enough if the user types and immediately navigates away.

### Step 7: Clear local draft cache after successful checkout

**File:** `frontend/src/features/checkout/use-checkout-flow.ts`

**Changes:**

- On the successful completion path only:
  - invalidate cart as today
  - set `QUERY_KEYS.cartContactDraft` to `null` before routing to success

Suggested addition:

```ts
queryClient.setQueryData(QUERY_KEYS.cartContactDraft, null);
```

Apply this only in the completed path, not in:

- `line_login`
- `not_friend`

**Rationale:** If the backend deletes the draft but the frontend cache keeps an old value, the user can briefly see stale restored fields when revisiting `/cart` in the same SPA session.

### Step 8: Invalidate the draft on auth changes

**File:** `frontend/src/lib/auth-context.tsx`

**Changes:**

- Extend `invalidateAuthQueries()` usage so login/register/logout also refresh the contact-draft cache.

**Rationale:** The session persists across auth transitions, and cart-related state already uses centralized invalidation. The draft should follow the same pattern.

### Step 9: Add tests

**Files:**

- `frontend/src/queries/use-cart-contact-draft.spec.tsx`
- `frontend/src/app/cart/page.spec.tsx`
- `frontend/src/features/checkout/use-checkout-flow.spec.ts`

**Changes:**

- Query hook tests:
  - `GET` returns `null` or saved draft
  - `PUT` updates cache without a refetch loop
  - `DELETE` clears cache

- Cart page tests:
  - hydrates form fields from a saved draft
  - autosaves edited values
  - clicking "Continue Shopping" flushes pending draft save before navigation
  - does not use `sessionStorage` or `localStorage` as the persistence path

- Checkout flow tests:
  - successful completion clears `QUERY_KEYS.cartContactDraft`
  - `line_login` and `not_friend` do not clear it

**Rationale:** The main risks are silent data loss on navigation and stale cache after checkout.

## Testing Steps

1. Load `/cart` with an existing saved draft and confirm fields hydrate before the user edits.
2. Edit one field and confirm the autosave request is sent after the debounce window.
3. Type and immediately click "Continue Shopping"; confirm the flush request happens before navigation.
4. Return to `/cart` and confirm values are restored from the server.
5. Complete checkout successfully and confirm returning to `/cart` shows an empty draft.
6. Confirm browser storage inspection shows no saved PII in `sessionStorage` or `localStorage`.

## Dependencies

- Depends on: backend draft API and shared types
- Must complete before: final feature verification

## Notes

- Do not add browser-storage fallbacks for this feature. A fallback would silently reintroduce the exact security posture the PRD rejected.
- If later work needs broader navigation interception, add it as a follow-up. The first-pass implementation should focus on deterministic autosave plus explicit flush on the known "Continue Shopping" path.
