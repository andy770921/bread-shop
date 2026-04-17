# FIX-3: `/cart` Image Loading Glitch — Root Cause Analysis and Fix Strategy

## Problem Statement

When the user opens `/cart`, product thumbnails can spend a noticeable amount of time loading.
Before the final image appears, the UI can briefly show an ugly browser-level broken-image state instead of a controlled placeholder.

The screenshot strongly suggests that the issue is not just "images are slow".
It is a combination of:

- incomplete optimistic cart data
- a missing fallback asset contract
- no controlled image-loading UI
- a slower remote-image delivery path than the rest of the cart row

## What the Current Code Does

### 1. `/cart` renders cached cart items before route synchronization finishes

File: `frontend/src/app/cart/page.tsx`

Relevant behavior:

- `CartContent` starts with `isCartSyncing = true`
- on mount it runs:
  - `flushPendingCartMutations()`
  - `invalidateQueries({ queryKey: QUERY_KEYS.cart })`
- but the page only shows the loading skeleton when:

```ts
const showLoadingState = isLoading || (isCartSyncing && items.length === 0);
```

That means:

- if the cart query already contains cached items, the page renders them immediately
- this happens even while the page is still synchronizing the authoritative cart

This is a valid optimization for fast UI, but it becomes fragile when the cached items are incomplete.

### 2. optimistic add-to-cart items do not carry product image or name data

File: `frontend/src/queries/use-cart.ts`

The optimistic path creates a synthetic cart line like this:

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

So before the server response comes back, the cart cache may contain:

- empty product names
- `image_url: null`
- correct price only

This matches the visual symptom very well: the row can show the price while the image area is broken or empty.

### 3. `/cart` converts `null` image URLs into a fallback path that does not exist

File: `frontend/src/app/cart/page.tsx`

Current logic:

```ts
const imageUrl = item.product.image_url || '/placeholder-product.jpg';
```

The same fallback string is also used in:

- `frontend/src/components/product/product-card.tsx`
- `frontend/src/components/product/product-editorial.tsx`

But there is no corresponding `frontend/public/placeholder-product.jpg` in the repository.

So when `image_url` is `null`, the browser requests `/placeholder-product.jpg`, receives a 404, and shows the native broken-image rendering.

This is the direct source of the "ugly default image" state in the screenshot.

## Why This Happens Specifically on `/cart`

`/cart` is uniquely exposed because it sits behind a route-level cart synchronization boundary.

Sequence:

1. The user adds a product from a listing page.
2. `useAddToCart()` writes an optimistic cart item with `image_url: null`.
3. The user navigates to `/cart` before the debounced cart write fully settles.
4. `/cart` reads the existing query cache immediately.
5. Because `items.length > 0`, it skips the loading skeleton even though `isCartSyncing` is still `true`.
6. The image source falls back to `/placeholder-product.jpg`.
7. That file does not exist, so the browser shows a broken-image icon.
8. After the mutation flush + cart refetch complete, the authoritative cart arrives with the real `image_url`, and the image eventually appears.

This explains why the problem looks like a "slow loading image" issue but is actually a state-quality issue first.

## Secondary Performance Factor

Even after the broken fallback is fixed, cart thumbnails may still appear later than the row text.

Why:

- the cart row text comes from the cart API response
- the image then loads separately from a remote URL
- `next/image` is enabled for remote domains in `frontend/next.config.ts`
- for uncached remote images, the browser often waits on the Next image optimization path before the thumbnail is paint-ready

So there are two separate layers:

1. incorrect fallback / incomplete optimistic data
2. real image-loading latency for remote assets

The first layer causes the ugly broken icon.
The second layer explains why the visual gap is noticeable even when the final image is valid.

## Evidence That This Is Not Only a Raw Network Problem

If `/cart` were simply waiting for the first cart fetch from scratch, the page would show skeleton rows because `isLoading` would be `true`.

The broken-image state appears when the page has enough cached item data to render the row shell, but not enough image data to render a valid image source.

That points directly to optimistic cache shape and fallback behavior, not only bandwidth.

## Root Causes

### Root Cause 1: Missing placeholder asset

The code assumes `/placeholder-product.jpg` exists, but the repo does not provide it.

Impact:

- guaranteed broken-image UI whenever `image_url` is `null`
- noisy 404s in the browser/network panel

### Root Cause 2: optimistic cart items are under-specified

The optimistic cart entry carries only `price`.
It drops data that the UI already has at add-to-cart time:

- localized names
- image URL
- category labels

Impact:

- `/cart` can render incomplete rows during synchronization
- the image fallback path gets exercised unnecessarily

### Root Cause 3: `/cart` treats "has items in cache" as "safe to render"

Current logic only protects the empty-cache case.
It does not distinguish between:

- authoritative cart rows
- incomplete optimistic cart rows

Impact:

- transient incorrect UI is visible during the route synchronization window

### Root Cause 4: no controlled image-loading or error UI

The cart thumbnail area currently renders the `<Image />` directly with no:

- skeleton/background placeholder
- opacity transition
- `onError` fallback state
- reserved UI for failure

Impact:

- the browser decides how failure looks
- the loading phase feels harsher than the rest of the row

### Root Cause 5: remote thumbnail delivery is still relatively slow

Even when the URL is valid, the cart row text can render before the image is ready.

Impact:

- visual mismatch between text readiness and image readiness
- more noticeable on first visit or cold cache

## Recommended Fix Strategy

The correct fix is layered.
Do not solve this with only a single placeholder file.

### Layer 1: remove the broken-image state entirely

Required:

- replace the invalid placeholder contract with a real, controlled fallback
- never allow the browser's native broken-image UI to be the visible state

Practical options:

- add a real static asset in `frontend/public/placeholder-product.jpg`
- or better, render a CSS-based fallback surface with an icon/text and no failing network request

Recommendation:

- prefer a UI fallback component over a fake image file for `/cart`
- if a static asset is added for consistency elsewhere, still keep the component-level error handling

### Layer 2: improve optimistic cart quality

Required:

- pass a product snapshot into `useAddToCart()`
- build optimistic cart items from known product data, not only `productId + price`

This should include:

- `name_zh`
- `name_en`
- `image_url`
- category names if already available

Benefits:

- `/cart` can render a realistic row immediately after navigation
- the image URL will often already be in browser cache if the user came from a product list
- the "broken first, correct later" transition disappears for the most common path

### Layer 3: protect `/cart` from incomplete cached rows

Required:

- do not assume every cached item is render-ready
- keep a controlled placeholder state while `isCartSyncing` is `true` and the item data is incomplete

Examples of incomplete item heuristics:

- missing `image_url`
- empty localized product name
- synthetic negative `id`

Recommendation:

- use a targeted route boundary:
  - if cached items are complete, render them immediately
  - if cached items are obviously optimistic/incomplete, show cart-row skeletons until synchronization finishes

This keeps the page fast without exposing low-quality intermediate data.

### Layer 4: add thumbnail-level loading UX

Required:

- wrap the cart thumbnail in a small image component
- show a neutral skeleton or branded placeholder background first
- fade the image in only after load success
- switch to a visual fallback state on error

This solves both:

- failed image requests
- the awkward empty box before remote thumbnails finish

### Layer 5: evaluate whether cart thumbnails should bypass Next optimization

This is optional and should be measured, not assumed.

If profiling shows `/_next/image` is the dominant delay for 80px cart thumbnails, consider:

- keeping `next/image` globally
- but using `unoptimized` only for cart thumbnails
- or serving explicit thumbnail-sized URLs from storage/CDN

Do not disable optimization globally just for this issue.

## Recommended Implementation Direction

Most robust path:

1. add a dedicated thumbnail component for cart/product images
2. fix optimistic cart data so it includes a real product snapshot
3. add a "render-safe" check on `/cart` during synchronization
4. add tests covering optimistic rows, loading state, and image failure fallback

## Expected Outcome After the Fix

After the recommended changes:

- `/cart` never shows a browser broken-image icon
- rows added optimistically already have correct names and image URLs
- the cart page no longer exposes incomplete cache state during synchronization
- remote thumbnails still may take time on cold cache, but the user sees a controlled skeleton/fallback instead of a broken image

## Summary

The visible glitch is not caused by one slow image alone.

The main issue is:

- incomplete optimistic cart data reaches `/cart`
- `/cart` renders that data before synchronization completes
- the fallback image path is invalid

The long-term quality fix is therefore:

- improve the optimistic cart payload
- render a controlled thumbnail state
- treat image loading as part of the cart row UX, not as an unmanaged browser detail
