# Implementation Plan: Shared Types (@repo/shared)

## Overview

All TypeScript interfaces shared between frontend and backend. These types define the API contracts and ensure type safety across the monorepo.

## Files to Modify

### Shared Types

- `shared/src/types/product.ts` — Product and Category types
- `shared/src/types/cart.ts` — Cart item and cart response types
- `shared/src/types/order.ts` — Order and order item types
- `shared/src/types/user.ts` — User profile types
- `shared/src/types/auth.ts` — Auth request/response types
- `shared/src/types/favorite.ts` — Favorite types
- `shared/src/types/common.ts` — Shared pagination, error types
- `shared/src/index.ts` — Barrel export (update)

## Step-by-Step Implementation

### Step 1: Create common types

**File:** `shared/src/types/common.ts`

```typescript
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}
```

### Step 2: Create product types

**File:** `shared/src/types/product.ts`

```typescript
export interface ProductSpec {
  label_zh: string;
  label_en: string;
  value_zh: string;
  value_en: string;
}

export type BadgeType = 'hot' | 'new' | 'seasonal';

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
  badge_text_zh: string | null;
  badge_text_en: string | null;
  specs: ProductSpec[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductWithCategory extends Product {
  category: Category;
}

export interface Category {
  id: number;
  slug: string;
  name_zh: string;
  name_en: string;
  sort_order: number;
  created_at: string;  // Review H-1: match DB column
}

export interface ProductListParams {
  category?: string;  // category slug
}

export interface ProductListResponse {
  products: ProductWithCategory[];
}

export interface CategoryListResponse {
  categories: Category[];
}
```

### Step 3: Create cart types

**File:** `shared/src/types/cart.ts`

```typescript
export interface CartItem {
  id: number;
  // session_id removed — internal field, not exposed to frontend (Review H-2)
  product_id: number;
  quantity: number;
  product: {
    id: number;
    name_zh: string;
    name_en: string;
    price: number;
    image_url: string | null;
    category_name_zh: string;
    category_name_en: string;
  };
  line_total: number; // quantity * product.price (server-computed)
}

export interface CartResponse {
  items: CartItem[];
  subtotal: number;      // sum of all line_totals
  shipping_fee: number;  // 0 if subtotal >= 500, else 60
  total: number;         // subtotal + shipping_fee
  item_count: number;    // total quantity across all items
}

export interface AddToCartRequest {
  product_id: number;
  quantity: number;  // 1-99 (Review M-5: upper limit)
}

export interface UpdateCartItemRequest {
  quantity: number;  // 1-99 (Review M-5: upper limit)
}
```

### Step 4: Create auth types

**File:** `shared/src/types/auth.ts`

```typescript
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  access_token: string;
  refresh_token: string;
}

// Review M-2: MeResponse is now an alias for UserProfile
export type MeResponse = UserProfile;
```

### Step 5: Create user types

**File:** `shared/src/types/user.ts`

```typescript
// Review M-2: unified UserProfile — same shape as MeResponse
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  preferred_language: string;
  line_user_id: string | null;
}

export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
  preferred_language?: 'zh' | 'en';
}
```

### Step 6: Create favorite types

**File:** `shared/src/types/favorite.ts`

```typescript
export interface Favorite {
  id: number;
  user_id: string;
  product_id: number;
  created_at: string;
}

export interface FavoriteListResponse {
  product_ids: number[];  // simple list for checking "is favorited"
}
```

### Step 7: Create order types

**File:** `shared/src/types/order.ts`

```typescript
export type OrderStatus = 'pending' | 'paid' | 'preparing' | 'shipping' | 'delivered' | 'cancelled';
export type PaymentMethod = 'lemon_squeezy' | 'line';

export interface CreateOrderRequest {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address: string;
  notes?: string;
  payment_method: PaymentMethod;
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_name_zh: string;
  product_name_en: string;
  product_price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: number;
  order_number: string;
  status: OrderStatus;
  subtotal: number;
  shipping_fee: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_address: string;
  notes: string | null;
  payment_method: PaymentMethod | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderListResponse {
  orders: Omit<Order, 'items'>[];
}

export interface CheckoutResponse {
  checkout_url: string;  // Lemon Squeezy checkout URL
}

export interface LineSendResponse {
  success: boolean;
  message: string;
}
```

### Step 8: Update barrel export

**File:** `shared/src/index.ts`

```typescript
// Existing
export * from './types/health';
export * from './types/api';

// New
export * from './types/common';
export * from './types/product';
export * from './types/cart';
export * from './types/auth';
export * from './types/user';
export * from './types/favorite';
export * from './types/order';
```

## Testing Steps

1. Run `cd shared && npm run build` to verify all types compile without errors
2. Import types in both frontend and backend to verify path resolution

## Dependencies

- Must complete before: backend-api.md, frontend-ui.md
- Depends on: database-schema.md (types mirror DB columns)

## Notes

- All timestamps are `string` (ISO 8601) — Supabase returns timestamps as strings via REST
- Price fields are `number` (integers in NTD) — no floating point issues
- Cart `line_total` and order `subtotal` are server-computed, never trusted from client
- `ProductWithCategory` includes nested category for frontend display
- `FavoriteListResponse` returns only product IDs for efficient "is favorited" checks
