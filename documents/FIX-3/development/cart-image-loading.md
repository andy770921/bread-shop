# FIX-3: `/cart` Image Loading — Development Steps

## Goal

Eliminate the broken-image flash on `/cart`, make optimistic cart rows render with complete product data, and show a controlled loading/fallback state while remote thumbnails finish loading.

## Recommended Change Order

1. Stop relying on the missing placeholder image path.
2. Pass full product snapshot data into optimistic add-to-cart.
3. Prevent `/cart` from rendering incomplete cached rows during route synchronization.
4. Add thumbnail loading/failure UI.
5. Add focused regression tests.

## Step 1: Replace the invalid placeholder contract

### Why

The current fallback string `'/placeholder-product.jpg'` is referenced in multiple components but no such file exists in the repo.

### Files to change

- `frontend/src/app/cart/page.tsx`
- `frontend/src/components/product/product-card.tsx`
- `frontend/src/components/product/product-editorial.tsx`

### Code areas to change

Current pattern:

```ts
const imageUrl = item.product.image_url || '/placeholder-product.jpg';
```

and:

```ts
const imageUrl = product.image_url || '/placeholder-product.jpg';
```

### Recommended implementation

Do not let raw UI code decide image fallback with a string literal.

Introduce a shared image wrapper, for example:

- `frontend/src/components/product/product-image.tsx`

Responsibilities:

- accept `src`, `alt`, and sizing props
- render a neutral placeholder surface immediately
- render the real image when load succeeds
- render a controlled fallback UI when `src` is missing or load fails

This removes duplicated fallback logic and prevents future 404 placeholders.

## Step 2: Enrich optimistic add-to-cart data

### Why

The add-to-cart flow already knows the full product object, but the optimistic cart cache only stores:

- `productId`
- `price`

That is the main reason `/cart` can render a row with price but no valid image source.

### Files to change

- `frontend/src/hooks/use-add-to-cart-handler.ts`
- `frontend/src/queries/use-cart.ts`

### Code areas to change

#### `frontend/src/hooks/use-add-to-cart-handler.ts`

Current call:

```ts
addToCart(productId, product.price);
```

Change direction:

- pass a product snapshot instead of only `productId` and `price`

Suggested shape:

```ts
addToCart({
  productId: product.id,
  product: {
    id: product.id,
    name_zh: product.name_zh,
    name_en: product.name_en,
    price: product.price,
    image_url: product.image_url,
    category_name_zh: product.category.name_zh,
    category_name_en: product.category.name_en,
  },
});
```

#### `frontend/src/queries/use-cart.ts`

Current optimistic branch creates synthetic empty fields:

```ts
product: {
  id: productId,
  name_zh: '',
  name_en: '',
  price: productPrice,
  image_url: null,
  category_name_zh: '',
  category_name_en: '',
}
```

Change it so the optimistic cart item reuses the passed product snapshot.

### Expected effect

- `/cart` can render a correct name immediately
- `/cart` can render a valid image URL immediately
- if the image was already requested on the product list page, the browser may reuse cache and display it much faster

## Step 3: Gate `/cart` against incomplete optimistic rows

### Why

`/cart` currently renders any non-empty cached cart while synchronization is still running.
That is too permissive.

### Files to change

- `frontend/src/app/cart/page.tsx`

### Code areas to change

Current logic:

```ts
const showLoadingState = isLoading || (isCartSyncing && items.length === 0);
```

### Recommended implementation

Introduce a completeness check before deciding the page is render-safe.

Example direction:

```ts
const hasIncompleteItems = items.some((item) => {
  const name = locale === 'zh' ? item.product.name_zh : item.product.name_en;
  return !name?.trim() || !item.product.image_url;
});

const showLoadingState = isLoading || (isCartSyncing && (items.length === 0 || hasIncompleteItems));
```

This keeps the current fast path for healthy cached rows, but hides obviously incomplete optimistic rows until the route sync finishes.

### Alternative

If you want the simplest behavior and can tolerate a slightly slower cart entry:

```ts
const showLoadingState = isLoading || isCartSyncing;
```

This is more conservative and easier to reason about, but it sacrifices some perceived speed.

Recommended choice:

- start with the targeted completeness check
- only use the fully blocking version if the targeted approach still feels inconsistent

## Step 4: Add a controlled thumbnail component for `/cart`

### Why

Even after optimistic data is fixed, remote thumbnails can still arrive later than text content.
The row needs a controlled visual state during that gap.

### Files to change

- add `frontend/src/components/product/product-image.tsx`
- update `frontend/src/app/cart/page.tsx` to use it

Optional follow-up:

- update `frontend/src/components/product/product-card.tsx`
- update `frontend/src/components/product/product-editorial.tsx`

### Recommended component behavior

Props:

- `src?: string | null`
- `alt: string`
- `sizes: string`
- `className?: string`
- `fill?: boolean`

Internal state:

- `isLoaded`
- `hasError`

Render behavior:

1. Always render a styled placeholder background first.
2. If `src` exists and `hasError === false`, render `<Image />` with:
   - `onLoad` or `onLoadingComplete`
   - opacity transition from `0` to `100`
3. If `src` is missing or image loading fails, render a fallback UI:
   - subtle background
   - product/photo icon
   - no broken browser image

### Important detail

Reset local `isLoaded` and `hasError` state when `src` changes.
Otherwise a previously failed image can keep the component in a stale error state.

## Step 5: Decide whether to keep or bypass Next image optimization for cart thumbnails

### Why

For very small cart thumbnails, `next/image` optimization can sometimes cost more than it saves, especially on cold cache.

### Files to consider

- `frontend/src/components/product/product-image.tsx`
- `frontend/next.config.ts`

### Recommended approach

Do not change `frontend/next.config.ts` first.

Instead:

1. implement the UI fix above
2. measure whether cart thumbnails are still noticeably late
3. if yes, test `unoptimized` on the cart thumbnail component only

This keeps the scope narrow and avoids a global image-policy change for a local issue.

## Step 6: Add regression coverage

### Files to change

- `frontend/src/app/cart/page.spec.tsx`
- add `frontend/src/components/product/product-image.spec.tsx`
- add or extend `frontend/src/queries/use-cart.spec.ts`

If `use-cart.spec.ts` does not exist yet, create it.

### Tests to add

#### A. Optimistic add-to-cart keeps product metadata

Target:

- `frontend/src/queries/use-cart.spec.ts`

Verify:

- when a new product is optimistically added, the cart cache entry includes:
  - localized names
  - `image_url`
  - category names

#### B. `/cart` does not expose incomplete optimistic rows during sync

Target:

- `frontend/src/app/cart/page.spec.tsx`

Setup:

- mock `useCart()` to return a cached row with `image_url: null` and empty name
- keep `flushPendingCartMutations()` unresolved initially

Verify:

- cart row skeleton or placeholder is shown
- the broken-image path is not rendered as `/placeholder-product.jpg`

#### C. cart thumbnail falls back cleanly on image error

Target:

- `frontend/src/components/product/product-image.spec.tsx`

Verify:

- when `src` is missing, fallback UI renders immediately
- when image loading fails, fallback UI renders
- browser broken-image icon is never relied on

#### D. cart thumbnail fades in on load success

Target:

- `frontend/src/components/product/product-image.spec.tsx`

Verify:

- placeholder is visible first
- image becomes visible only after load event

## Step 7: Optional consistency cleanup

### Why

The same broken fallback path currently exists outside `/cart`.
If you only fix the cart page, the same bug can still appear elsewhere later.

### Files to consider

- `frontend/src/components/product/product-card.tsx`
- `frontend/src/components/product/product-editorial.tsx`

### Recommended action

Migrate those components to the same shared image wrapper after the cart fix is stable.

This is a good follow-up even if `/cart` is the immediate priority.

## Minimal File Touch List

If you want the smallest fix with high impact, change these first:

- `frontend/src/app/cart/page.tsx`
- `frontend/src/hooks/use-add-to-cart-handler.ts`
- `frontend/src/queries/use-cart.ts`
- `frontend/src/components/product/product-image.tsx`
- `frontend/src/app/cart/page.spec.tsx`

## Recommended Final Shape

After implementation, the cart path should work like this:

1. Add-to-cart writes a complete optimistic product snapshot.
2. `/cart` synchronizes pending writes on mount.
3. If cached rows are incomplete, `/cart` shows controlled skeleton rows until sync completes.
4. Each thumbnail renders through a shared component with:
   - load placeholder
   - fade-in on success
   - controlled fallback on error

That combination fixes both the ugly glitch and the deeper state-quality problem that caused it.
