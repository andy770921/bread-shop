# REFACTOR-1: Standardize API Calls with React Query + defaultFetchFn

## Problem

The frontend has two patterns for API calls:

1. **Proper pattern** (in `queries/`): React Query hooks (`useQuery`/`useMutation`) with raw `fetch` inside `queryFn`/`mutationFn`.
2. **Ad-hoc pattern** (in pages/context): Raw `fetch()` with manually constructed headers, credentials, and error handling — duplicated across files.

Additionally, `utils/fetchers/fetchers.client.ts` exports a `defaultFetchFn` utility that provides timeout handling, structured error responses (`ApiResponseError`), and automatic JSON parsing. **No file in the codebase uses it.** All existing fetch calls bypass this utility entirely.

## Current State Audit

### Files with raw fetch (NOT using defaultFetchFn or React Query hooks)

| File | Calls | Methods | Issue |
|------|-------|---------|-------|
| `lib/auth-context.tsx` | 4 | GET, POST x3 | Raw fetch for /auth/me, login, register, logout |
| `app/cart/page.tsx` | 3 | POST x3 | Raw fetch in handleCheckout for orders, line-send, confirm |
| `app/profile/page.tsx` | 1 | PATCH | Raw fetch for profile update |
| `app/orders/page.tsx` | 1 | GET | Raw fetch inside inline useQuery (no shared hook) |
| `app/orders/[id]/page.tsx` | 1 | GET | Raw fetch inside inline useQuery (no shared hook) |

### Files already using React Query hooks (in `queries/`)

| File | Hooks | Uses defaultFetchFn? |
|------|-------|---------------------|
| `queries/use-cart.ts` | useQuery + 2 useMutation | No — raw fetch |
| `queries/use-products.ts` | useQuery | No — raw fetch |
| `queries/use-favorites.ts` | useQuery + useMutation | No — raw fetch |
| `queries/use-categories.ts` | useQuery | No — raw fetch |

### Common issues across all raw fetch calls

1. **No timeout** — raw `fetch` has no abort controller; `defaultFetchFn` provides 100s timeout.
2. **No structured errors** — each call manually parses error JSON; `defaultFetchFn` throws `ApiResponseError` with `.status`, `.body`.
3. **Duplicated header logic** — `getAuthHeaders()` from `lib/api.ts` and manual `{ Authorization: Bearer ${token} }` and `credentials: 'include'` repeated everywhere.
4. **Missing `Content-Type`** — `defaultFetchFn` auto-sets `Accept: application/json` and serializes body via `JSON.stringify`; raw calls manually set `Content-Type`.
5. **No credentials** — `getFetchQueryOptions` doesn't set `credentials: 'include'`, which is required for session cookies. This needs to be fixed in the utility.

## Strategy

### 1. Fix `getFetchQueryOptions` to include credentials

Add `credentials: 'include'` to the base fetch options so all API calls carry the session cookie automatically.

### 2. Create `authedFetchFn` — a variant that injects auth headers

Extend `defaultFetchFn` to automatically read the Bearer token from localStorage and inject it. This replaces the manual `getAuthHeaders()` pattern.

### 3. Extract shared React Query hooks for all API endpoints

Move inline `useQuery`/`useMutation` calls from pages into dedicated hook files under `queries/`:

- `queries/use-orders.ts` — `useOrders()`, `useOrder(id)` (extract from orders pages)
- `queries/use-checkout.ts` — `useCreateOrder()`, `useLineSend()`, `useConfirmOrder()` (extract from cart page)
- `queries/use-profile.ts` — `useUpdateProfile()` (extract from profile page)

### 4. Migrate existing hooks to use defaultFetchFn

Update `use-cart.ts`, `use-products.ts`, `use-favorites.ts`, `use-categories.ts` to replace raw `fetch` with `defaultFetchFn` / `authedFetchFn`.

### 5. Migrate auth-context.tsx to use defaultFetchFn

Auth context functions (login, register, logout, fetchUser) should use `defaultFetchFn` for consistent error handling. These stay as imperative calls (not React Query) because they manage context state directly.

## Out of scope

- `app/auth/callback/page.tsx` — one-time LINE OAuth code exchange; acceptable as raw fetch.
- `lib/api-client.ts` — not used anywhere in components; can be removed if dead code.
- `queries/use-cart.ts` `useAddToCart` — complex debounced optimistic logic; migrating the internal fetch to `defaultFetchFn` only, keeping the custom hook structure.
