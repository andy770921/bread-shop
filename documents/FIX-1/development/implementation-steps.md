# FIX-1: Implementation Steps

## Decisions

- **Backend**: Option A — PostgreSQL UPSERT RPC
- **Frontend**: Option D — Optimistic UI + Debounced API call

---

## Step 1: Supabase Migration — UNIQUE Constraint + RPC Function

### 1a. Add UNIQUE constraint on `cart_items(session_id, product_id)`

```sql
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_session_product_unique
  UNIQUE (session_id, product_id);
```

This is required for `ON CONFLICT` to work. If duplicate rows already exist, they
must be cleaned up first (keep the one with highest quantity, delete the rest).

### 1b. Create RPC function `upsert_cart_item`

```sql
CREATE OR REPLACE FUNCTION upsert_cart_item(
  p_session_id UUID,
  p_product_id BIGINT,
  p_quantity INT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO cart_items (session_id, product_id, quantity)
  VALUES (p_session_id, p_product_id, p_quantity)
  ON CONFLICT (session_id, product_id)
  DO UPDATE SET
    quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 99),
    updated_at = now();
END;
$$;
```

**Apply via**: Supabase MCP `apply_migration` or SQL Editor.

---

## Step 2: Backend — Simplify `cart.service.ts` addItem

Replace the current 3-query pattern (validate product → check existing → insert/update)
with:

```typescript
async addItem(sessionId: string, productId: number, quantity: number) {
  const supabase = this.supabaseService.getClient();

  // 1. Validate product exists and is active (keep this — it's a business rule)
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('is_active', true)
    .single();

  if (!product) throw new BadRequestException('Product not found or inactive');

  // 2. Atomic upsert via RPC (replaces SELECT + branch + INSERT/UPDATE)
  const { error } = await supabase.rpc('upsert_cart_item', {
    p_session_id: sessionId,
    p_product_id: productId,
    p_quantity: quantity,
  });

  if (error) throw error;

  // 3. Return updated cart
  return this.getCart(sessionId);
}
```

**Result**: 3 queries reduced to 2 (validate + upsert), zero race window on the
upsert itself.

---

## Step 3: Frontend — New `useAddToCart` with Optimistic UI + Debounce

### 3a. Rewrite `useAddToCart()` in `frontend/src/queries/use-cart.ts`

The new hook must:

1. **On each call**: immediately update the TanStack Query cache (optimistic update)
   - If product already in cart: increment its `quantity` and recalculate `line_total`,
     `subtotal`, `shipping_fee`, `total`, `item_count`
   - If product not in cart: append a temporary item with product data
2. **Debounce**: accumulate quantity per product_id, reset a 500ms timer on each call
3. **On timer fire**: send ONE `POST /api/cart/items` with `quantity = accumulated`
4. **On API success**: reconcile cache with server response (replace optimistic data)
5. **On API error**: roll back cache to last known server state, show error toast

Key implementation details:
- Use `useRef` for the debounce timer and pending quantities map
- Use `useCallback` for the stable `addToCart` function
- Store `lastServerCart` ref to enable rollback
- The hook returns `{ addToCart, isPending }` instead of a mutation object

### 3b. Update consumers (`product-grid.tsx`, `product-showcase.tsx`)

Replace:
```typescript
const addToCart = useAddToCart();
const handleAddToCart = (productId: number) => {
  addToCart.mutate({ productId, quantity: 1 }, { onSuccess, onError });
};
```

With:
```typescript
const { addToCart } = useAddToCart();
const handleAddToCart = (productId: number) => {
  addToCart(productId);
};
```

Toast notification moves inside the hook (fires on API success/error after debounce).

---

## Step 4: Verify

1. Start dev servers: `npm run dev`
2. Open browser, rapidly click "Add to Cart" 5 times on a cookie product
3. Verify: cart badge updates instantly (1→2→3→4→5)
4. Verify: Network tab shows only **1** POST request with `quantity: 5`
5. Verify: After response, cart state matches server
6. Test error case: disable network, click add, verify rollback
7. Run `npm run test` and `npm run lint` to check for regressions

---

## Files Changed

| File | Change |
|---|---|
| Supabase SQL migration | New UNIQUE constraint + `upsert_cart_item` function |
| `backend/src/cart/cart.service.ts` | Replace addItem body with `supabase.rpc()` call |
| `frontend/src/queries/use-cart.ts` | Rewrite `useAddToCart` with optimistic + debounce |
| `frontend/src/components/product/product-grid.tsx` | Update handleAddToCart to use new API |
| `frontend/src/components/product/product-showcase.tsx` | Update handleAddToCart to use new API |
