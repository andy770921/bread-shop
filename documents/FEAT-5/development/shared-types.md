# Implementation Plan: Shared Package (@repo/shared)

## Overview

Extend the `@repo/shared` package in two parts:

**Part 1 — Shared Types:** Add admin and site-content types consumed by backend, customer frontend, and admin frontend.

1. Add `role` to `UserProfile` (existing user type).
2. Add `stock_quantity` to `Product` (existing product type).
3. New `admin.ts` module exporting admin-specific types (`UserRole`, `AdminMe`).
4. New `site-content.ts` module exporting `SiteContentEntry` and response wrappers.

**Part 2 — Shared Fetch & Query Utilities:** Extract framework-agnostic fetch and query-key utilities from `frontend/` into `@repo/shared` so both customer frontend and admin frontend consume identical logic without duplication.

Keep all DTO request shapes on the backend (using `class-validator` decorators) — `@repo/shared` stays declarative for types, and runtime-only for utilities (no React dependency).

## Files to Modify

### Part 1: Types

#### Modified

- `shared/src/types/user.ts`
  - `UserProfile` gains `role: UserRole`
- `shared/src/types/product.ts`
  - `Product` gains `stock_quantity: number`
- `shared/src/index.ts`
  - Re-export new type modules + new utility modules

#### New

- `shared/src/types/admin.ts`
  - `UserRole`, `AdminMe`
- `shared/src/types/site-content.ts`
  - `SiteContentEntry`, `SiteContentResponse`, `UpdateSiteContentRequest`

### Part 2: Fetch & Query Utilities

#### Moved from `frontend/src/` → `shared/src/`

| Source (frontend) | Destination (shared) | Exports |
|---|---|---|
| `utils/fetchers/fetchers.error.ts` | `utils/fetchers/fetchers.error.ts` | `ApiResponseError` |
| `utils/fetchers/fetchers.utils.ts` | `utils/fetchers/fetchers.utils.ts` | `FetchOptions`, `getFetchQueryOptions`, `parseErrorBody` |
| `utils/fetchers/fetchers.ts` | `utils/fetchers/fetchers.ts` | `fetchApi`, `streamingFetchApi` |
| `constants/common.ts` | `constants/common.ts` | `HTTP_STATUS_CODE` |
| `vendors/tanstack-query/provider.utils.ts` | `utils/query/stringify-query-key.ts` | `stringifyQueryKey` |

#### New (barrel re-exports)

- `shared/src/utils/fetchers/index.ts`
- `shared/src/utils/query/index.ts`

#### Stays in `frontend/` (NOT extracted)

| File | Reason |
|---|---|
| `utils/fetchers/fetchers.client.ts` | Wires `authTokenStore` (frontend-specific) into shared `fetchApi` |
| `vendors/tanstack-query/provider.tsx` | React component; each app creates its own |
| All query hooks (`queries/*`) | Domain-specific (cart, favorites, orders, etc.) |
| Cart session bootstrap (`queries/cart-session.ts`) | Frontend-specific session cookie logic |
| Debounced cart mutation hook | Too specialized for cart domain |

## Step-by-Step Implementation

### Part 1: Types

### Step 1: Update `UserProfile`

**File:** `shared/src/types/user.ts`

```ts
import type { UserRole } from './admin';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  preferred_language: string;
  line_user_id: string | null;
  role: UserRole;          // new
}

export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  preferred_language?: 'zh' | 'en';
  // intentionally no `role` — role changes are backend-only, not a self-service API
}
```

**Rationale:** exposing `role` on the read type lets the customer frontend (and admin frontend's `useAdminAuth`) know what the current user is, without calling a second endpoint. `UpdateProfileRequest` intentionally omits `role` so TypeScript itself blocks a client from trying to PATCH it.

### Step 2: Update `Product`

**File:** `shared/src/types/product.ts`

```ts
export interface Product {
  id: number;
  category_id: number;
  name_zh: string;
  name_en: string;
  description_zh: string | null;
  description_en: string | null;
  price: number;
  image_url: string | null;
  badge_type: BadgeType | null;
  specs: ProductSpec[];
  is_active: boolean;
  sort_order: number;
  stock_quantity: number;    // new
  created_at: string;
  updated_at: string;
}
```

No rename of existing fields. The customer frontend reads `stock_quantity` to disable "Add to cart" when 0.

### Step 3: New `admin.ts`

**File:** `shared/src/types/admin.ts`

```ts
export type UserRole = 'customer' | 'admin' | 'owner';

export interface AdminMe {
  id: string;
  email: string;
  role: Exclude<UserRole, 'customer'>;
}

/** Response shape for GET /api/admin/dashboard */
export interface AdminDashboardStats {
  todayOrderCount: number;
  todayRevenue: number;
  pendingOrderCount: number;
  lowStockProductCount: number;
  ordersByStatus: Record<string, number>;
  topProducts: Array<{
    product_id: number;
    name_zh: string;
    image_url: string | null;
    total_quantity: number;
  }>;
  recentOrders: Array<{
    id: number;
    order_number: string;
    customer_name: string;
    total: number;
    status: string;
    created_at: string;
  }>;
  lowStockProducts: Array<{
    id: number;
    name_zh: string;
    stock_quantity: number;
  }>;
}
```

**Rationale:** `AdminMe.role` narrows out `'customer'` because `GET /api/admin/me` is behind `AdminAuthGuard` — the endpoint never returns a customer role. `AdminDashboardStats` provides the full response shape for the dashboard overview endpoint.

### Step 4: New `site-content.ts`

**File:** `shared/src/types/site-content.ts`

```ts
export interface SiteContentEntry {
  key: string;                 // e.g. "home.title"
  value_zh: string | null;
  value_en: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface SiteContentResponse {
  overrides: SiteContentEntry[];
}

export interface UpdateSiteContentRequest {
  value_zh?: string | null;
  value_en?: string | null;
}
```

**Why `string | null` (not `string | undefined`):** `null` lets the admin UI explicitly clear one locale while keeping the other, and matches the DB column nullability.

### Step 5: Update the barrel export

**File:** `shared/src/index.ts`

```ts
// Types
export * from './constants/cart';
export * from './types/api';
export * from './types/auth';
export * from './types/cart';
export * from './types/common';
export * from './types/favorite';
export * from './types/health';
export * from './types/order';
export * from './types/product';
export * from './types/user';
export * from './types/admin';          // new
export * from './types/site-content';   // new

// Utilities (added in Part 2)
export * from './constants/common';
export * from './utils/fetchers';
export * from './utils/query';
```

### Step 6: Rebuild shared

Turbo's task graph (`test`, `lint` depend on `^build`) already rebuilds `shared` before the apps consume it. Locally:

```bash
npm run build --workspace=shared
```

---

### Part 2: Fetch & Query Utilities

### Step 7: Add utility files to shared

Create the following structure:

```
shared/src/
├── constants/
│   ├── cart.ts                        # existing
│   └── common.ts                      # HTTP_STATUS_CODE (moved from frontend)
├── utils/
│   ├── fetchers/
│   │   ├── index.ts                   # re-exports
│   │   ├── fetchers.error.ts          # ApiResponseError class
│   │   ├── fetchers.utils.ts          # FetchOptions, getFetchQueryOptions, parseErrorBody
│   │   └── fetchers.ts                # fetchApi, streamingFetchApi
│   └── query/
│       ├── index.ts                   # re-exports
│       └── stringify-query-key.ts     # stringifyQueryKey
```

**File:** `shared/src/constants/common.ts`

```ts
export const HTTP_STATUS_CODE = {
  REQUEST_TIMEOUT: 408,
};
```

**File:** `shared/src/utils/fetchers/fetchers.error.ts`

Move from `frontend/src/utils/fetchers/fetchers.error.ts` — no changes needed.

```ts
export class ApiResponseError<TErrorBody = unknown> extends Error {
  public status: number;
  public statusText: string;
  public body: TErrorBody;

  public constructor(rawResponse: Response, body: TErrorBody, message?: string) {
    super(message);
    this.name = 'ApiResponseError';
    this.statusText = rawResponse.statusText;
    this.status = rawResponse.status;
    this.body = body;
  }

  public hasStatusCode(statusCode: number) {
    return this.status === statusCode;
  }
}
```

**File:** `shared/src/utils/fetchers/fetchers.utils.ts`

Move from `frontend/src/utils/fetchers/fetchers.utils.ts` — no changes needed.

```ts
export interface FetchOptions<TRequestBody> {
  method?: string;
  headers?: Record<string, string>;
  body?: TRequestBody;
  isJSONResponse?: boolean;
  returnHeaders?: boolean;
  timeout?: number;
}

const getMutationRequestBody = <TRequestBody>(requestBody: TRequestBody): BodyInit | undefined => {
  if (requestBody) {
    return requestBody instanceof Blob || requestBody instanceof FormData
      ? requestBody
      : JSON.stringify(requestBody);
  }
  return undefined;
};

export const getFetchQueryOptions = <TRequestBody>({
  method = 'GET',
  headers,
  body,
}: FetchOptions<TRequestBody>): RequestInit => {
  return {
    method,
    credentials: 'include' as RequestCredentials,
    headers: {
      ...(body && !(body instanceof Blob) && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      Accept: 'application/json',
      ...headers,
    },
    ...(body ? { body: getMutationRequestBody(body) } : {}),
  };
};

export const parseErrorBody = async <TErrorBody = unknown>(
  response: Response,
): Promise<TErrorBody | string> => {
  let errorBody: TErrorBody | string = '';
  if (response.headers.get('content-length') !== '0') {
    try {
      errorBody = (await response.json()) as TErrorBody;
    } catch {
      try {
        errorBody = await response.text();
      } catch {
        errorBody = '';
      }
    }
  }
  return errorBody;
};
```

**File:** `shared/src/utils/fetchers/fetchers.ts`

Move from `frontend/src/utils/fetchers/fetchers.ts`. One change: import `HTTP_STATUS_CODE` from the shared constant instead of the frontend alias.

```ts
import { FetchOptions, getFetchQueryOptions, parseErrorBody } from './fetchers.utils';
import { ApiResponseError } from './fetchers.error';
import { HTTP_STATUS_CODE } from '../../constants/common';

// ... rest of file is identical to frontend version
```

**File:** `shared/src/utils/fetchers/index.ts`

```ts
export { ApiResponseError } from './fetchers.error';
export { fetchApi, streamingFetchApi } from './fetchers';
export type { FetchOptions } from './fetchers.utils';
export { getFetchQueryOptions, parseErrorBody } from './fetchers.utils';
```

### Step 8: Handle the `lodash-es` dependency in `stringifyQueryKey`

`stringifyQueryKey` uses `isPlainObject` from `lodash-es`. Since `shared/` compiles to CommonJS, replace it with an inline check to avoid ESM/CJS incompatibility:

**File:** `shared/src/utils/query/stringify-query-key.ts`

```ts
import { QueryKey } from '@tanstack/react-query';

type QueryStringObject = Record<string, number | string | (number | string)[]>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const assertIsQueryStringObject = (obj: unknown): obj is QueryStringObject => {
  if (!isPlainObject(obj)) return false;
  return Object.values(obj).every(
    (value) => typeof value === 'number' || typeof value === 'string' || Array.isArray(value),
  );
};

const transformStandardParams = (queryStringObject: QueryStringObject) =>
  Object.entries(queryStringObject).reduce<string[][]>((array, [key, value]) => {
    if (Array.isArray(value)) {
      return [...array, ...value.map((item) => [key, item.toString()])];
    }
    return [...array, [key, value.toString()]];
  }, []);

export const stringifyQueryKey = (queryKey: QueryKey): string => {
  return `${queryKey.reduce((path, currentItem) => {
    if (Array.isArray(currentItem)) {
      return `${path}/${currentItem.join('/')}`;
    }
    if (assertIsQueryStringObject(currentItem)) {
      const standardParams = transformStandardParams(currentItem);
      const queryStringPair = new URLSearchParams(standardParams);
      return `${path}?${queryStringPair.toString()}`;
    }
    return `${path}/${currentItem}`;
  })}`;
};
```

**Note:** This adds `@tanstack/react-query` as a **devDependency** (types-only) to `shared/package.json` for the `QueryKey` type. At runtime, each app provides its own `@tanstack/react-query` instance.

**File:** `shared/src/utils/query/index.ts`

```ts
export { stringifyQueryKey } from './stringify-query-key';
```

### Step 9: Update `frontend/` imports

Replace local imports with `@repo/shared`:

```ts
// Before
import { fetchApi } from '@/utils/fetchers/fetchers';
import { ApiResponseError } from '@/utils/fetchers/fetchers.error';
import { stringifyQueryKey } from '@/vendors/tanstack-query/provider.utils';
import { HTTP_STATUS_CODE } from '@/constants/common';

// After
import { fetchApi, ApiResponseError, stringifyQueryKey, HTTP_STATUS_CODE } from '@repo/shared';
```

Keep `frontend/src/utils/fetchers/fetchers.client.ts` in place — it wires `authTokenStore` into the shared `fetchApi`:

```ts
import { authTokenStore } from '@/lib/auth-token-store';
import { fetchApi, streamingFetchApi } from '@repo/shared';
import type { FetchOptions } from '@repo/shared';

export const defaultFetchFn = async <TResponseData, TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<TResponseData> => {
  return fetchApi(`/${path}`, options);
};

export const authedFetchFn = async <TResponseData, TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<TResponseData> => {
  const token = authTokenStore.get();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return fetchApi(`/${path}`, {
    ...options,
    headers: { ...authHeaders, ...options?.headers },
  });
};

export const streamingFetchFn = async <TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<Response> => {
  return streamingFetchApi(`/${path}`, options);
};
```

### Step 10: Move tests

- Move `frontend/src/vendors/tanstack-query/provider.utils.spec.ts` → `shared/src/utils/query/stringify-query-key.spec.ts` (update import path).
- Move relevant fetcher tests (if any) to shared.
- Delete the original files from `frontend/`:
  - `frontend/src/utils/fetchers/fetchers.error.ts`
  - `frontend/src/utils/fetchers/fetchers.utils.ts`
  - `frontend/src/utils/fetchers/fetchers.ts`
  - `frontend/src/constants/common.ts`
  - `frontend/src/vendors/tanstack-query/provider.utils.ts`
  - `frontend/src/vendors/tanstack-query/provider.utils.spec.ts`

### Step 11: Verify full build

```bash
npm run build          # shared compiles; frontend resolves @repo/shared imports
cd frontend && npm test   # existing tests pass with new import paths
```

---

## Testing Steps

### Part 1: Types

1. `npm run build --workspace=shared` succeeds with no TS errors.
2. `npm run build` (full monorepo) — frontend and backend both compile against the updated types.
3. In `backend/src/supabase/supabase.service.ts` (or any file importing `Product`), ensure `stock_quantity` is recognised.
4. In `admin-frontend/src/lib/admin-auth-context.tsx`, ensure `AdminMe` resolves from `@repo/shared`.
5. Attempt a negative check: `const bad: UpdateProfileRequest = { role: 'owner' };` must be a TS error.

### Part 2: Utilities

6. `npm run build --workspace=shared` — shared compiles with the new utility files.
7. `npm run build` — both frontend and backend resolve `@repo/shared` imports.
8. `cd frontend && npm test` — existing tests pass with updated import paths.
9. Verify `stringifyQueryKey` tests pass in shared: `cd shared && npx jest src/utils/query/stringify-query-key.spec.ts`.
10. In `admin-frontend`, verify `import { fetchApi, stringifyQueryKey } from '@repo/shared'` resolves correctly.

## Dependencies

- **Depends on:** `database-schema.md` (columns must exist before types lie about them — actually types can land first, but there's no reason to)
- **Blocks:** `backend-api.md`, `admin-frontend.md` (both consume these types and utilities)

## Notes

- Backend `class-validator` DTOs (`CreateProductDto`, etc.) are **not** moved into `@repo/shared`. Keeping DTOs backend-local avoids dragging `class-validator` into the browser bundles; the shared package stays declarative for types only.
- If the admin frontend later needs to validate forms against the same shape, use `zod` schemas defined in `admin-frontend/src/lib/schemas/` — do not duplicate into `shared`.
- `UserRole` is exported from `admin.ts` (not `user.ts`) so admin-specific additions live together. `UserProfile` imports `UserRole` via `import type` to avoid a circular runtime import.
- The shared utility extraction adds `@tanstack/react-query` as a **devDependency** to shared (for the `QueryKey` type only). It does NOT add React as a dependency — all extracted utilities are pure TypeScript with zero React imports.
- `lodash-es` dependency is **not** carried over to shared. The `isPlainObject` usage in `stringifyQueryKey` is replaced with an inline 3-line implementation to avoid CJS/ESM compatibility issues in the shared package.
