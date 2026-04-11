# REFACTOR-2: Implementation Steps

## Step 1: Create `useAuthGuard` hook

**New file:** `frontend/src/hooks/use-auth-guard.ts`

```typescript
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function useAuthGuard() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [isLoading, user, router]);

  return { user, isLoading, isReady: !isLoading && !!user };
}
```

**Consumers:** Replace auth boilerplate in:
- `app/orders/page.tsx` — remove `useAuth`, `useRouter`, `useEffect` for auth; use `useAuthGuard()`
- `app/orders/[id]/page.tsx` — same
- `app/profile/page.tsx` — same (keep `refreshUser` from `useAuth` separately)

---

## Step 2: Extract `getStatusColor` utility

**New file:** `frontend/src/utils/order.ts`

```typescript
import type { OrderStatus } from '@repo/shared';

export function getStatusColor(status: OrderStatus): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    pending: { backgroundColor: '#FEF3C7', color: '#92400E' },
    paid: { backgroundColor: '#D1FAE5', color: '#065F46' },
    preparing: { backgroundColor: '#DBEAFE', color: '#1E40AF' },
    shipping: { backgroundColor: '#E0E7FF', color: '#3730A3' },
    delivered: { backgroundColor: '#D1FAE5', color: '#065F46' },
    cancelled: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  };
  return map[status] ?? {};
}
```

**Consumers:**
- `app/orders/page.tsx` — delete local `getStatusColor`, import from `@/utils/order`
- `app/orders/[id]/page.tsx` — same

---

## Step 3: Extract `useAddToCartHandler` hook

**New file:** `frontend/src/hooks/use-add-to-cart-handler.ts`

```typescript
import { toast } from 'sonner';
import { useAddToCart } from '@/queries/use-cart';
import { useLocale } from '@/hooks/use-locale';
import type { ProductWithCategory } from '@repo/shared';

export function useAddToCartHandler(products: ProductWithCategory[]) {
  const { t } = useLocale();
  const { addToCart } = useAddToCart({
    onError: () => toast.error('Failed to add to cart'),
  });

  const handleAddToCart = (productId: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    addToCart(productId, product.price);
    toast.success(t('home.addedToCart'));
  };

  return handleAddToCart;
}
```

**Consumers:**
- `components/product/product-grid.tsx` — remove `useAddToCart`, `useLocale` (for cart), `toast` imports; use `useAddToCartHandler(products)`
- `components/product/product-showcase.tsx` — same

---

## Step 4: Fix shared types in query hooks

### `queries/use-orders.ts`
- Delete local `OrderListResponse` interface
- Import `OrderListResponse`, `Order` from `@repo/shared`
- Type `useOrder()` return as `Order`

### `queries/use-checkout.ts`
- Delete local `CreateOrderBody` and `LineSendResponse` interfaces
- Import `CreateOrderRequest` from `@repo/shared`
- Extend `CreateOrderRequest` with `skip_cart_clear` field locally
- Import `Order` for create return type
- Keep local `LineSendResponse` but add `needs_friend` and `add_friend_url` fields (these are not in shared types yet)

### `queries/use-profile.ts`
- Import `UserProfile` from `@repo/shared` for return type (if available), otherwise keep `any` for now

---

## Step 5: Update consumer pages

### `app/orders/page.tsx`
1. Remove: `useEffect` import, `useRouter` import, `useAuth` import, local `getStatusColor`
2. Add: `import { useAuthGuard } from '@/hooks/use-auth-guard'`, `import { getStatusColor } from '@/utils/order'`
3. Replace auth logic with: `const { user, isLoading: authLoading } = useAuthGuard();`
4. Remove: `const router = useRouter();` and the auth `useEffect` block

### `app/orders/[id]/page.tsx`
1. Same removals and additions as orders list page
2. Keep `useParams` for route params

### `app/profile/page.tsx`
1. Replace auth guard useEffect with `useAuthGuard`
2. Keep `useAuth` for `refreshUser` only
3. Remove `useRouter` import, `useEffect` import (for auth)

---

## Step 6: Verify

1. `npm run build` — ensure no TypeScript errors
2. `npm run dev` — start dev server
3. Test flows:
   - Browse products (unauthenticated)
   - Add to cart
   - Visit /orders (should redirect to login)
   - Login
   - Visit /orders (should show orders)
   - Visit /profile (should show profile form)
   - Edit profile
   - Visit order detail page
