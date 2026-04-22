# Implementation Plan: admin-frontend Workspace

## Overview

Create a new **Vite + React** SPA workspace under `admin-frontend/` in the monorepo. It runs on port 3002, deploys as a static site to Vercel (or any static host), and talks to the same backend as the customer frontend.

**Why Vite instead of Next.js:** The admin panel is a pure client-side app — no SEO, no SSR/SSG, no `next/image` optimization needed. Vite offers faster dev startup, simpler config (no `'use client'` annotations), smaller bundles (no SSR runtime), and more flexible deployment as static files.

**Stack:** Vite 6 + React 18 + react-router-dom + TanStack Query + Tailwind CSS v4 + react-hook-form + shadcn/ui + Vitest.

The admin frontend reuses shared fetch/query utilities from `@repo/shared` and Bearer-token auth in localStorage, but does **not** share components, providers, or design tokens with `frontend/`.

---

## Prerequisite: Shared Utility Extraction

Before building admin-frontend, the shared fetch/query utilities must be extracted into `@repo/shared`. See **`shared-types.md` → "Part 2: Shared Fetch & Query Utilities"** for the full extraction plan, file structure, and migration steps.

After extraction, admin-frontend imports `fetchApi`, `stringifyQueryKey`, `ApiResponseError`, `FetchOptions`, etc. from `@repo/shared`.

---

## Files to Create

### New Workspace Files

```
admin-frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                          # shadcn/ui config
├── index.html                               # Vite entry HTML
├── .eslintrc (inherits from root)
├── .env.local (gitignored)
├── src/
│   ├── main.tsx                             # React entry point
│   ├── App.tsx                              # Router setup
│   ├── globals.css                          # Tailwind + minimal admin theme
│   ├── routes/
│   │   ├── Login.tsx                        # Login page (/)
│   │   └── dashboard/
│   │       ├── DashboardLayout.tsx          # Sidebar shell + auth guard
│   │       ├── DashboardIndex.tsx           # Overview page (KPIs, recent orders, top products)
│   │       ├── products/
│   │       │   ├── ProductList.tsx          # List
│   │       │   ├── ProductNew.tsx           # Create
│   │       │   └── ProductEdit.tsx          # Edit (:id)
│   │       ├── content/
│   │       │   └── ContentEditor.tsx        # Grouped copy editor
│   │       └── orders/
│   │           ├── OrderList.tsx            # List
│   │           └── OrderDetail.tsx          # Detail (:id)
│   ├── components/
│   │   ├── ui/                              # shadcn/ui (separate instance)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Topbar.tsx
│   │   ├── products/
│   │   │   ├── ProductForm.tsx
│   │   │   ├── ImageUploader.tsx
│   │   │   └── StockQuickEdit.tsx
│   │   ├── content/
│   │   │   └── ContentKeyEditor.tsx
│   │   └── orders/
│   │       ├── OrderStatusSelect.tsx
│   │       └── OrderDetailCard.tsx
│   ├── lib/
│   │   ├── admin-fetchers.ts               # wires adminTokenStore into shared fetchApi
│   │   ├── admin-auth-context.tsx           # token + user state
│   │   ├── admin-auth-guard.tsx             # route-level redirect
│   │   ├── admin-token-store.ts             # localStorage wrappers
│   │   └── content-keys.ts                 # imports zh.json via Vite alias, flattens/groups keys
│   ├── queries/
│   │   ├── useAdminMe.ts
│   │   ├── useAdminDashboard.ts
│   │   ├── useAdminProducts.ts
│   │   ├── useSiteContent.ts
│   │   ├── useAdminOrders.ts
│   │   └── useProductImageUpload.ts
│   ├── hooks/
│   │   └── use-locale.ts                    # LocaleProvider + useLocale() hook (zh-only for now)
│   ├── vendors/
│   │   └── tanstack-query/provider.tsx      # QueryClientProvider using shared stringifyQueryKey
│   └── i18n/
│       └── zh.json                          # admin copy (zh-only)
```

### Root Monorepo Files to Modify

- `package.json` — add `admin-frontend` to `workspaces`
- `turbo.json` — no change (existing tasks pattern-match across workspaces)
- `.prettierrc` / root `.eslintrc.js` — no change

---

## Step-by-Step Implementation

### Step 1: Scaffold the workspace

**File:** `admin-frontend/package.json`

```json
{
  "name": "admin-frontend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 3002",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 3002",
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.2.2",
    "@repo/shared": "*",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-query-devtools": "^5.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.8.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-hook-form": "^7.72.1",
    "react-router-dom": "^7.6.0",
    "shadcn": "^4.2.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.2.2",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.5.2",
    "jsdom": "^26.1.0",
    "tailwindcss": "^4.2.2",
    "typescript": "^5.7.3",
    "vite": "^6.3.0",
    "vitest": "^3.2.1"
  }
}
```

**Rationale:** No Next.js — pure Vite SPA. Uses `react-router-dom` for client-side routing, `react-hook-form` + `@hookform/resolvers` + `zod` for form validation. Vitest replaces Jest (see Testing section below). No `next-themes` (admin has a single neutral theme).

Then add to the root `package.json`:

```json
"workspaces": ["frontend", "admin-frontend", "backend", "shared"]
```

### Step 2: Vite config

**File:** `admin-frontend/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

**Why the proxy:** Same reason as the customer frontend's Next.js rewrites — keeps `/api/*` same-origin during development. In production, configure the reverse proxy at the hosting level (Vercel rewrites, nginx, etc.) or point directly to the backend URL.

**File:** `admin-frontend/index.html`

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Papa Bakery Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Step 3: TypeScript config

**File:** `admin-frontend/tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**File:** `admin-frontend/tsconfig.app.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

**File:** `admin-frontend/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

### Step 4: React entry + Router

**File:** `admin-frontend/src/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AdminAuthProvider } from '@/lib/admin-auth-context';
import TanStackQueryProvider from '@/vendors/tanstack-query/provider';
import App from './App';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TanStackQueryProvider>
        <AdminAuthProvider>
          <App />
        </AdminAuthProvider>
      </TanStackQueryProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

**File:** `admin-frontend/src/App.tsx`

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Login from '@/routes/Login';
import DashboardLayout from '@/routes/dashboard/DashboardLayout';
import DashboardIndex from '@/routes/dashboard/DashboardIndex';
import ProductList from '@/routes/dashboard/products/ProductList';
import ProductNew from '@/routes/dashboard/products/ProductNew';
import ProductEdit from '@/routes/dashboard/products/ProductEdit';
import ContentEditor from '@/routes/dashboard/content/ContentEditor';
import OrderList from '@/routes/dashboard/orders/OrderList';
import OrderDetail from '@/routes/dashboard/orders/OrderDetail';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardIndex />} />
          <Route path="products" element={<ProductList />} />
          <Route path="products/new" element={<ProductNew />} />
          <Route path="products/:id" element={<ProductEdit />} />
          <Route path="content" element={<ContentEditor />} />
          <Route path="orders" element={<OrderList />} />
          <Route path="orders/:id" element={<OrderDetail />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
```

### Step 5: TanStack Query provider (using shared utilities)

**File:** `admin-frontend/src/vendors/tanstack-query/provider.tsx`

```tsx
import { useState, FC, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { stringifyQueryKey } from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

const TanStackQueryProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 0,
            throwOnError: true,
            queryFn: async ({ queryKey }) => {
              return defaultFetchFn(stringifyQueryKey(queryKey));
            },
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export default TanStackQueryProvider;
```

### Step 6: Fetch wrappers (using shared fetchApi)

**File:** `admin-frontend/src/lib/admin-fetchers.ts`

```ts
import { adminTokenStore } from './admin-token-store';
import { fetchApi } from '@repo/shared';
import type { FetchOptions } from '@repo/shared';

export const defaultFetchFn = async <TResponseData, TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<TResponseData> => {
  const token = adminTokenStore.get();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return fetchApi(`/${path}`, {
    ...options,
    headers: { ...authHeaders, ...options?.headers },
  });
};
```

**Why a single `defaultFetchFn`:** Unlike the customer frontend which has separate unauthenticated and authenticated fetch functions (for guest cart vs logged-in user), admin always sends the Bearer token. One function is enough.

### Step 7: Auth token store

**File:** `admin-frontend/src/lib/admin-token-store.ts`

```ts
const KEY = 'admin_token';

export const adminTokenStore = {
  get: () => localStorage.getItem(KEY),
  set: (t: string) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};
```

No `typeof window` guard needed — Vite is always client-side.

### Step 8: Auth context

**File:** `admin-frontend/src/lib/admin-auth-context.tsx`

```tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminTokenStore } from './admin-token-store';
import { defaultFetchFn } from './admin-fetchers';
import type { AdminMe } from '@repo/shared';

type Ctx = {
  user: AdminMe | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AdminAuthContext = createContext<Ctx | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = adminTokenStore.get();
    if (!token) { setLoading(false); return; }
    defaultFetchFn<AdminMe>('api/admin/me')
      .then(setUser)
      .catch(() => adminTokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { access_token } = await defaultFetchFn<{ access_token: string }>('api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    adminTokenStore.set(access_token);
    try {
      const me = await defaultFetchFn<AdminMe>('api/admin/me');
      setUser(me);
      navigate('/dashboard');
    } catch (err) {
      adminTokenStore.clear();
      throw err;
    }
  }

  function logout() {
    adminTokenStore.clear();
    setUser(null);
    navigate('/');
  }

  return (
    <AdminAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth outside provider');
  return ctx;
};
```

**Why** the two-phase login: first get a token, then verify role via `/api/admin/me`. If the user is a customer, `/api/admin/me` returns 403 and we clear the token before surfacing the error — the admin frontend never holds a token that has no admin access.

### Step 9: Auth guard (route-level)

**File:** `admin-frontend/src/lib/admin-auth-guard.tsx`

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from './admin-auth-context';

export function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/', { replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) return null;
  return <>{children}</>;
}
```

`DashboardLayout` wraps its `<Outlet />` with `<AdminAuthGuard>`.

### Step 9.5: i18n (`useLocale` + `LocaleProvider`)

Admin is zh-only for v1, but we still route all UI copy through a `useLocale` hook that mirrors the customer frontend's pattern. This keeps components free of hardcoded strings and leaves an obvious seam to add `en` (or any other locale) later — you would only need to add a second JSON file and surface a locale state in the provider.

**File:** `admin-frontend/src/i18n/config.ts`

```ts
export const DEFAULT_LOCALE = 'zh' as const;
export type Locale = typeof DEFAULT_LOCALE;
```

**File:** `admin-frontend/src/i18n/zh.json` — all admin UI strings, grouped by feature (`app`, `nav`, `login`, `dashboard`, `product`, `content`, `order`, `common`).

**File:** `admin-frontend/src/hooks/use-locale.ts`

```tsx
import { createContext, createElement, useCallback, useContext, useMemo, type ReactNode } from 'react';
import zhMessages from '@/i18n/zh.json';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

type NestedRecord = { [key: string]: string | NestedRecord };
const messages: Record<Locale, NestedRecord> = { zh: zhMessages as NestedRecord };

interface LocaleContextType {
  locale: Locale;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale: Locale = DEFAULT_LOCALE;
  const t = useCallback((key: string): string => {
    const parts = key.split('.');
    let current: unknown = messages[locale];
    for (const p of parts) {
      if (current && typeof current === 'object') {
        current = (current as NestedRecord)[p];
      } else return key;
    }
    return typeof current === 'string' ? current : key;
  }, [locale]);
  const value = useMemo(() => ({ locale, t }), [locale, t]);
  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}
```

**Wiring:** `main.tsx` wraps the tree with `<LocaleProvider>` (outside `TanStackQueryProvider`). Every component gets strings via:

```tsx
const { t } = useLocale();
return <h1>{t('dashboard.title')}</h1>;
```

**Why mirror the customer pattern:** same mental model for engineers moving between the two apps; if we later add `en` for the admin, only `use-locale.ts` changes (add locale state, add `enMessages`), callers are untouched.

### Step 10: Login page (`/`)

**File:** `admin-frontend/src/routes/Login.tsx`

- Centered card with email + password inputs + "Sign in" button.
- Uses `react-hook-form` + `zod` for validation.
- On submit calls `useAdminAuth().login`.
- On `ApiResponseError` with `status=403`, show "此帳號沒有管理權限" (error copy in `i18n/zh.json`, resolved via `useLocale().t('login.noAccess')`).
- On success, `login()` navigates to `/dashboard`.

### Step 11: Dashboard layout + sidebar

**File:** `admin-frontend/src/routes/dashboard/DashboardLayout.tsx`

- Wrap `<Outlet />` in `<AdminAuthGuard>`.
- Left sidebar with four items: Dashboard (overview), Products, Content, Orders. Use `<NavLink>` from react-router-dom for active state.
- Top-right corner shows the admin email, a dark-mode toggle button, and a Logout button.
- Follow the design mockup layout: 260px sidebar, top bar with search + user info, scrollable main content area.

### Step 12: Dashboard overview page

**File:** `admin-frontend/src/routes/dashboard/DashboardIndex.tsx`

The landing page after login. Displays key business metrics from `GET /api/admin/dashboard`.

**Layout** (following design.html):

1. **KPI cards row** (4 cards): Today's order count, today's revenue, pending orders count, low-stock product count. Each card shows the value and a trend indicator.
2. **Recent orders table**: Last 10 orders with order_number, customer name, total, status badge, and date. Each row links to `/dashboard/orders/:id`.
3. **Top selling products list**: Top 5 products by order quantity, shown as horizontal bar chart (matching design.html).
4. **Orders by status breakdown**: Visual display of order pipeline (how many pending, paid, preparing, etc.).

**Query hook:**

```ts
// queries/useAdminDashboard.ts
import { useQuery } from '@tanstack/react-query';
import type { AdminDashboardStats } from '@repo/shared';

export function useAdminDashboard() {
  return useQuery<AdminDashboardStats>({
    queryKey: ['api', 'admin', 'dashboard'],
    staleTime: 30 * 1000, // refresh every 30s for near-real-time feel
  });
}
```

**Design notes:**
- Use the design.html color palette (warm neutrals with `--primary-500: #D4885A` accent)
- KPI cards with subtle shadows and hover lift effect
- Status badges use the same color coding as the design (pending=warning, completed=success, shipping=primary)
- Dark mode support via CSS custom properties (same approach as design.html's `body.dark-mode`)

### Step 13: Products list + CRUD pages

**File:** `admin-frontend/src/routes/dashboard/products/ProductList.tsx`

- Table with columns: image, name_zh, category, price, stock (inline ±/number input via `StockQuickEdit`), active toggle, edit-link, delete button.
- Header has a "New product" button linking to `/dashboard/products/new`.
- Delete button calls `DELETE /api/admin/products/:id`; on 409, show a toast suggesting "turn off the active flag instead".

**Files:** `ProductNew.tsx`, `ProductEdit.tsx` — share `<ProductForm>` component. Uses `react-hook-form` + `zod` for bilingual fields, price, category select, badge select, specs editor, active flag, sort order. Use `useParams()` from react-router-dom to get `:id`.

**Image upload:**

1. User drops a file on `<ImageUploader>`.
2. FE calls `POST /api/admin/uploads/product-image` with `{ filename, contentType, productId }`.
3. FE does `PUT` directly to `uploadUrl` with the file bytes and `Content-Type` header.
4. On success, FE sets the form's `image_url` to the returned `publicUrl`.
5. User hits "Save" → `PATCH /api/admin/products/:id` persists the URL.

### Step 14: Content editor

**File:** `admin-frontend/src/routes/dashboard/content/ContentEditor.tsx`

- Left column: section tabs (Home, Banner, Story, Process, Categories, Other).
- Right column: list of `key` rows. Each row shows two inputs (zh / en) + "Reset to default" button.

**Content key sync — direct import of zh.json (zero-maintenance approach):**

Instead of maintaining a static `groups.ts` that must be kept in sync with the frontend's i18n JSON, the admin-frontend directly imports `frontend/src/i18n/zh.json` via a Vite alias:

```ts
// vite.config.ts — add alias
resolve: {
  alias: {
    '@': path.resolve(__dirname, 'src'),
    '@frontend-i18n': path.resolve(__dirname, '../frontend/src/i18n'),
  },
}
```

```ts
// admin-frontend/src/lib/content-keys.ts
import zhDefaults from '@frontend-i18n/zh.json';
import enDefaults from '@frontend-i18n/en.json';

type NestedRecord = { [key: string]: string | NestedRecord };

/** Flatten nested JSON to dot-notation keys: { "home.title": "周爸烘焙坊", ... } */
function flattenKeys(obj: NestedRecord, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else {
      Object.assign(result, flattenKeys(value, fullKey));
    }
  }
  return result;
}

/** Group flattened keys by their top-level section */
export function getContentGroups() {
  const flatZh = flattenKeys(zhDefaults as NestedRecord);
  const flatEn = flattenKeys(enDefaults as NestedRecord);
  const groups: Record<string, Array<{ key: string; defaultZh: string; defaultEn: string }>> = {};

  for (const key of Object.keys(flatZh)) {
    const section = key.split('.')[0];
    if (!groups[section]) groups[section] = [];
    groups[section].push({
      key,
      defaultZh: flatZh[key] ?? '',
      defaultEn: flatEn[key] ?? '',
    });
  }

  return groups;
}
```

**Why this approach:**
- `zh.json` remains the single source of truth for which keys exist.
- When a developer adds a new key to `zh.json`, it automatically appears in the admin content editor on the next build — zero manual sync.
- The Vite alias resolves at build time; no runtime cross-workspace dependency.
- The admin UI shows default values alongside override inputs so the owner knows what they're changing.

**Save behavior:**

- `PUT /api/admin/site-content/:key` with `{ value_zh, value_en }` — both optional; empty string clears that locale.
- "Reset" button calls `DELETE /api/admin/site-content/:key`.

### Step 15: Orders list + detail

**File:** `admin-frontend/src/routes/dashboard/orders/OrderList.tsx`

- Filters: status (select), date range (optional, out of scope for v1).
- Table: order_number, created_at, total, status, customer name, LINE-sent indicator.

**File:** `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx`

- Two columns: customer info + LINE ID + notes; items + totals.
- Footer: `<OrderStatusSelect>` and "Resend LINE" button.
- `Resend LINE` calls `POST /api/admin/orders/:id/resend-line`; on `409 { reason: 'not_friend' }` show a warning linking to `add_friend_url`.
- Use `useParams()` from react-router-dom to get `:id`.

### Step 16: Customer frontend integration (`frontend/`)

This is a small addition to the **existing customer frontend** so site-content overrides and stock display take effect. Two changes: (A) merge copy overrides into i18n, (B) disable "Add to cart" when out of stock.

#### A. Site-content override integration

The goal is to fetch `/api/site-content` overrides and merge them into the existing `useLocale` hook's message objects, with **zero breaking API changes** to existing components.

**Step-by-step:**

1. **Add a TanStack Query hook** to fetch overrides:

**File:** `frontend/src/queries/use-site-content.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import type { SiteContentResponse } from '@repo/shared';

export function useSiteContent() {
  return useQuery<SiteContentResponse>({
    queryKey: ['api', 'site-content'],
    staleTime: 5 * 60 * 1000, // 5 min — content changes rarely
  });
}
```

2. **Add flatten/unflatten helpers:**

**File:** `frontend/src/i18n/merge-overrides.ts`

```ts
import type { SiteContentEntry } from '@repo/shared';

type NestedRecord = { [key: string]: string | NestedRecord };

function flattenKeys(obj: NestedRecord, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else {
      Object.assign(result, flattenKeys(value, fullKey));
    }
  }
  return result;
}

function unflatten(flat: Record<string, string>): NestedRecord {
  const result: NestedRecord = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current: NestedRecord = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] === 'string') {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as NestedRecord;
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

export function mergeOverrides(
  defaults: NestedRecord,
  overrides: SiteContentEntry[],
  locale: 'zh' | 'en',
): NestedRecord {
  const flat = flattenKeys(defaults);
  for (const o of overrides) {
    const val = locale === 'zh' ? o.value_zh : o.value_en;
    if (val != null && val !== '') {
      flat[o.key] = val;
    }
  }
  return unflatten(flat);
}
```

3. **Modify `LocaleProvider`** to merge overrides:

**File:** `frontend/src/hooks/use-locale.ts` (modify existing)

Inside the `LocaleProvider`, after loading the static `zh.json` / `en.json` messages:

```ts
import { useSiteContent } from '@/queries/use-site-content';
import { mergeOverrides } from '@/i18n/merge-overrides';

// Inside LocaleProvider:
const { data: siteContent } = useSiteContent();

const messages = useMemo(() => {
  const defaults = locale === 'zh' ? zhMessages : enMessages;
  if (!siteContent?.overrides?.length) return defaults;
  return mergeOverrides(defaults, siteContent.overrides, locale);
}, [locale, siteContent]);

// Use `messages` for the t() function instead of the raw imports
```

**Key constraint:** The `LocaleProvider` must be inside `TanStackQueryProvider` in the provider tree (it already is, per `providers.tsx`). The `useSiteContent` hook returns cached data; on first load it fetches once and caches for 5 minutes.

**Fallback behavior:** If the fetch fails or returns empty, `mergeOverrides` returns the defaults unchanged — the customer frontend degrades gracefully to static JSON.

#### B. Product stock UI on customer frontend

### Step 17: Product stock UI on customer frontend

Disable "Add to cart" when `stock_quantity === 0`. Grep `frontend/src/components` for the product card and the PDP button; add a disabled state + "Sold out" label (`spec.out_of_stock` i18n key — add to JSON).

### Step 18: Environment & deployment

**File:** `admin-frontend/.env.local.example`

```
VITE_API_URL=http://localhost:3000
```

**Vercel (static site):**

- New Vercel project, root directory `admin-frontend`.
- Framework preset: **Vite**.
- Build command: `npm run build` (outputs to `dist/`).
- Install command: `npm install` (Turbo ensures `@repo/shared` builds first via workspace graph).
- Add a `vercel.json` to handle SPA routing (all paths → `index.html`):

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://<backend-url>/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The first rewrite proxies API calls in production (replacing Vite's dev server proxy). The second rewrite enables client-side routing — without it, direct navigation to `/dashboard/products` would 404.

---

## Testing: Vitest Instead of Jest

### Why Vitest

The customer `frontend/` uses Jest because Next.js has strong Jest integration. For a Vite project, **Vitest is the natural choice**:

- **Native Vite integration** — shares the same config, plugins, and module resolution. No separate Babel/SWC transform pipeline needed.
- **ESM-first** — Vite projects use `"type": "module"`. Jest requires extra configuration (experimental ESM support or transform workarounds) to handle ESM dependencies. Vitest handles this natively.
- **Faster execution** — reuses Vite's transform cache; tests run in worker threads with HMR-aware file watching.
- **Jest-compatible API** — `describe`, `it`, `expect`, `vi.fn()`, `vi.mock()` are near-identical. Migration effort from Jest patterns is minimal.
- **No additional transform config** — Jest in a Vite project needs `ts-jest` or `@swc/jest` plus manual `moduleNameMapper` for path aliases. Vitest reads `vite.config.ts` directly.

### Vitest Configuration

**File:** `admin-frontend/vite.config.ts` (add test section)

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
});
```

**File:** `admin-frontend/src/test/setup.ts`

```ts
import '@testing-library/jest-dom/vitest';
```

This registers custom matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.) for Vitest's `expect`.

### Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- `vitest run` — single run (CI-friendly), matches Turborepo's `test` task.
- `vitest` — watch mode with HMR during development.

### Key Differences from Jest (for Developers)

| Jest | Vitest | Notes |
|---|---|---|
| `jest.fn()` | `vi.fn()` | Import `vi` from `vitest` (or use `globals: true`) |
| `jest.mock()` | `vi.mock()` | Same hoisting behavior |
| `jest.spyOn()` | `vi.spyOn()` | Identical API |
| `jest.useFakeTimers()` | `vi.useFakeTimers()` | Identical API |
| `@types/jest` | Not needed | Vitest provides its own types (via `globals: true` + tsconfig `types: ["vitest/globals"]`) |
| `jest-environment-jsdom` | `jsdom` (peer dep) | Install `jsdom` as devDependency |
| `moduleNameMapper` in jest config | Reads `resolve.alias` from vite.config | No separate path mapping needed |

### TypeScript Support

Add to `admin-frontend/tsconfig.app.json` compilerOptions:

```json
{
  "types": ["vitest/globals"]
}
```

This provides global type definitions for `describe`, `it`, `expect`, `vi`, etc. without explicit imports.

---

## Testing Steps

1. `cd admin-frontend && npm run dev` — Vite dev server starts on :3002.
2. Open `http://localhost:3002/` — login page renders.
3. Log in with a customer account → red error "此帳號沒有管理權限"; token is not persisted (check `localStorage`).
4. Log in with the owner account → navigates to `/dashboard/products`; sidebar and content render.
5. Navigate directly to `http://localhost:3002/dashboard/orders` → page renders (client-side routing works).
6. Create a new product with an image upload → record appears in Supabase; customer frontend lists it after refresh.
7. Edit `home.title` in the content editor → customer frontend shows the new text within the query staleTime.
8. Reset `home.title` override → customer frontend falls back to the JSON default on next refresh.
9. Change an order's status → customer's `/orders/:id` reflects the new status.
10. `cd admin-frontend && npm test` — Vitest suite passes.

## Dependencies

- **Depends on:** `backend-api.md` (all endpoints must exist)
- **Depends on:** `shared-types.md` Part 1 (`AdminMe`, `SiteContentEntry`, updated `Product`) + Part 2 (shared fetch/query utilities)
- **Depends on:** `database-schema.md` indirectly (through backend)
- **Blocks:** nothing — UI is the terminal layer

## Notes

- **Design mockups** will be provided by the user; this doc assumes a conventional admin CRUD layout (sidebar + table + form). Swap in the real design once available — components are isolated so layout changes stay local.
- **shadcn/ui**: run `npx shadcn@latest init` inside `admin-frontend/` to bootstrap; `components.json` is workspace-local, not shared with `frontend/`. Shadcn/ui supports Vite projects natively.
- **Tailwind theme**: keep it minimal (neutral grays + one accent color). Don't reuse `frontend/src/app/globals.css` — the customer design tokens are off-brand for a backoffice.
- **Playwright**: optional; the project already has `@playwright/test` at the root, so an admin smoke test (`login → create product → see it on customer frontend`) is cheap to add in a later PR.
- **Security**: the Bearer token has the same lifetime as a customer Supabase session. If stronger hygiene is needed, enforce a shorter session or MFA (out of scope for v1).
- **SPA routing caveat**: Since this is a client-side SPA, all routes are handled by react-router-dom in the browser. The production server must be configured to serve `index.html` for all paths (the `vercel.json` rewrite handles this for Vercel).
