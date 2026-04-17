# REFACTOR-4: Implementation Guide — Frontend i18n Enum Mapping

## Prerequisites

The following in-progress changes must be committed first (currently unstaged):
- `frontend/src/i18n/utils.ts` — locale helper functions
- `frontend/src/i18n/config.ts` — `Locale` type definition
- All files updated to use `pickLocalizedText` / `pickByLocale` / `Locale` type

---

## Phase 1: Category Names via i18n Keys

### Step 1.1 — Add category keys to i18n JSON

**`frontend/src/i18n/zh.json`** — add after `"home"` section:

```json
"category": {
  "toast": "吐司",
  "cake": "蛋糕",
  "cookie": "餅乾",
  "bread": "麵包",
  "other": "其他"
}
```

**`frontend/src/i18n/en.json`** — add after `"home"` section:

```json
"category": {
  "toast": "Toast",
  "cake": "Cake",
  "cookie": "Cookies",
  "bread": "Bread",
  "other": "Other"
}
```

### Step 1.2 — Create a helper with fallback (transitional — simplified in Phase 3)

**`frontend/src/i18n/utils.ts`** — add a category-specific helper:

```typescript
/**
 * Resolve a category display name.
 * Tries i18n key first; falls back to DB-provided name_zh/name_en
 * for unknown slugs (transitional — fallback removed in Phase 3).
 */
export function getCategoryName(
  locale: Locale,
  cat: { slug: string; name_zh: string; name_en: string },
  t: (key: string) => string,
): string {
  const i18nKey = `category.${cat.slug}`;
  const translated = t(i18nKey);
  // If t() returns the key itself (miss), fall back to DB value
  if (translated === i18nKey) {
    return pickLocalizedText(locale, { zh: cat.name_zh, en: cat.name_en });
  }
  return translated;
}
```

> **Note**: Check how `t()` handles missing keys. If it throws or returns `undefined` instead of echoing the key, adjust the guard condition accordingly.

### Step 1.3 — Update components

#### `frontend/src/components/product/category-pills.tsx`

```diff
- {pickLocalizedText(locale, { zh: cat.name_zh, en: cat.name_en })}
+ {getCategoryName(locale, cat, t)}
```

The component already has `const { t } = useLocale();` — just import `getCategoryName` from `@/i18n/utils`.

#### `frontend/src/components/product/product-card.tsx`

```diff
- const categoryName = pickLocalizedText(locale, {
-   zh: product.category.name_zh,
-   en: product.category.name_en,
- });
+ const categoryName = getCategoryName(locale, product.category, t);
```

#### `frontend/src/components/product/product-editorial.tsx`

```diff
- const categoryName = pickLocalizedText(locale, {
-   zh: product.category.name_zh,
-   en: product.category.name_en,
- });
+ const categoryName = getCategoryName(locale, product.category, t);
```

---

## Phase 2: Badge Text via i18n Keys

### Step 2.1 — Add badge keys to i18n JSON

**`frontend/src/i18n/zh.json`**:

```json
"badge": {
  "hot": "HOT",
  "new": "NEW",
  "seasonal": "季節限定"
}
```

**`frontend/src/i18n/en.json`**:

```json
"badge": {
  "hot": "HOT",
  "new": "NEW",
  "seasonal": "Seasonal"
}
```

### Step 2.2 — Create a badge helper with override support (transitional — simplified in Phase 3)

**`frontend/src/i18n/utils.ts`**:

```typescript
/**
 * Resolve badge display text.
 * Uses per-product DB text if available (allows custom overrides);
 * otherwise falls back to i18n key derived from badge_type.
 * (Transitional — override logic removed in Phase 3)
 */
export function getBadgeText(
  locale: Locale,
  badge: {
    badge_type: string;
    badge_text_zh: string | null;
    badge_text_en: string | null;
  },
  t: (key: string) => string,
): string {
  // Per-product override takes priority
  const override = pickLocalizedText(locale, {
    zh: badge.badge_text_zh,
    en: badge.badge_text_en,
  });
  if (override) return override;

  // Fall back to i18n enum mapping
  return t(`badge.${badge.badge_type}`);
}
```

### Step 2.3 — Update components

#### `frontend/src/components/product/product-card.tsx`

```diff
- const badgeText = product.badge_type
-   ? pickLocalizedText(locale, {
-       zh: product.badge_text_zh,
-       en: product.badge_text_en,
-     })
-   : null;
+ const badgeText = product.badge_type
+   ? getBadgeText(locale, product, t)
+   : null;
```

#### `frontend/src/components/product/product-editorial.tsx`

```diff
- {pickLocalizedText(locale, {
-   zh: product.badge_text_zh,
-   en: product.badge_text_en,
- })}
+ {getBadgeText(locale, product, t)}
```

---

## Phase 3: Remove DB Locale Columns + Enumify Spec Labels

> **Prerequisite**: Phase 1–2 deployed and verified.

### Step 3.1 — DB Migration: Drop Redundant Locale Columns

Run via Supabase SQL Editor or migration tool:

```sql
-- 1. Drop category locale columns
ALTER TABLE public.categories DROP COLUMN name_zh;
ALTER TABLE public.categories DROP COLUMN name_en;

-- 2. Drop product badge locale columns
ALTER TABLE public.products DROP COLUMN badge_text_zh;
ALTER TABLE public.products DROP COLUMN badge_text_en;

-- 3. Migrate product specs JSONB: label_zh/label_en → label_key
--    Mapping: { "重量" → "weight", "保鮮期" → "shelf_life", ... }
UPDATE public.products
SET specs = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'label_key',
      CASE (elem->>'label_en')
        WHEN 'Weight'      THEN 'weight'
        WHEN 'Shelf Life'  THEN 'shelf_life'
        WHEN 'Prep Time'   THEN 'prep_time'
        WHEN 'Size'        THEN 'size'
        WHEN 'Serves'      THEN 'serves'
        WHEN 'Quantity'    THEN 'quantity'
        WHEN 'Packaging'   THEN 'packaging'
        WHEN 'Production'  THEN 'production'
        WHEN 'Best Before' THEN 'best_before'
        WHEN 'Texture'     THEN 'texture'
        WHEN 'Flavor'      THEN 'flavor'
        ELSE lower(replace(elem->>'label_en', ' ', '_'))  -- fallback: auto-derive key
      END,
      'value_zh', elem->>'value_zh',
      'value_en', elem->>'value_en'
    )
  )
  FROM jsonb_array_elements(specs) AS elem
)
WHERE jsonb_array_length(specs) > 0;
```

### Step 3.2 — Update Shared Types

#### `shared/src/types/product.ts`

```diff
  export interface ProductSpec {
-   label_zh: string;
-   label_en: string;
+   label_key: string;
    value_zh: string;
    value_en: string;
  }

  export interface Product {
    ...
    badge_type: BadgeType | null;
-   badge_text_zh: string | null;
-   badge_text_en: string | null;
    specs: ProductSpec[];
    ...
  }

  export interface Category {
    id: number;
    slug: string;
-   name_zh: string;
-   name_en: string;
    sort_order: number;
    created_at: string;
  }
```

#### `shared/src/types/cart.ts`

```diff
  export interface CartItem {
    ...
    product: {
      id: number;
      name_zh: string;
      name_en: string;
      price: number;
      image_url: string | null;
-     category_name_zh: string;
-     category_name_en: string;
+     category_slug: string;
    };
    line_total: number;
  }
```

### Step 3.3 — Update Backend Services

#### `backend/src/cart/cart.service.ts` — `buildCartResponse()`

```diff
  .select(`
    id,
    product_id,
    quantity,
    product:products(
      id,
      name_zh,
      name_en,
      price,
      image_url,
-     category:categories(name_zh, name_en)
+     category:categories(slug)
    )
  `)
```

```diff
  product: {
    id: item.product.id,
    name_zh: item.product.name_zh,
    name_en: item.product.name_en,
    price: item.product.price,
    image_url: item.product.image_url,
-   category_name_zh: item.product.category.name_zh,
-   category_name_en: item.product.category.name_en,
+   category_slug: item.product.category.slug,
  },
```

#### `backend/src/order/order.service.ts` — `createOrder()` canonicalization

```diff
  .select(`
    id,
    name_zh,
    name_en,
    price,
    image_url,
-   category:categories(name_zh, name_en)
+   category:categories(slug)
  `)
```

```diff
  product: {
    id: product.id,
    name_zh: product.name_zh,
    name_en: product.name_en,
    price: product.price,
    image_url: product.image_url,
-   category_name_zh: product.category.name_zh,
-   category_name_en: product.category.name_en,
+   category_slug: product.category.slug,
  },
```

> **Note**: The `order_items` table still stores `product_name_zh` / `product_name_en` — these are **product name** snapshots (not category), and must be preserved.

#### `backend/src/order/order.service.ts` — `normalizeCheckoutCart()`

Same diff pattern — change the `categories(name_zh, name_en)` join and mapping. This method appears around line 220.

#### `backend/src/order/order.service.ts` — error message fix

```diff
- `Some products are no longer available: ${inactiveItems.map((i) => i.product.name_zh).join(', ')}`
+ `Some products are no longer available: ${inactiveItems.map((i) => i.product_id).join(', ')}`
```

(Or use `product.name_zh` from the `activeMap` if still available — the point is this doesn't rely on removed category fields.)

### Step 3.4 — Add spec label keys to i18n JSON

**`frontend/src/i18n/zh.json`**:

```json
"spec": {
  "weight": "重量",
  "shelf_life": "保鮮期",
  "prep_time": "製作時間",
  "size": "尺寸",
  "serves": "適用",
  "quantity": "數量",
  "packaging": "包裝",
  "production": "製作",
  "best_before": "最佳享用",
  "texture": "口感",
  "flavor": "風味"
}
```

**`frontend/src/i18n/en.json`**:

```json
"spec": {
  "weight": "Weight",
  "shelf_life": "Shelf Life",
  "prep_time": "Prep Time",
  "size": "Size",
  "serves": "Serves",
  "quantity": "Quantity",
  "packaging": "Packaging",
  "production": "Production",
  "best_before": "Best Before",
  "texture": "Texture",
  "flavor": "Flavor"
}
```

### Step 3.5 — Simplify Frontend Helpers (remove fallback code)

**`frontend/src/i18n/utils.ts`** — replace the transitional helpers:

```diff
- /**
-  * Resolve a category display name.
-  * Tries i18n key first; falls back to DB-provided name_zh/name_en
-  * for unknown slugs (transitional — fallback removed in Phase 3).
-  */
- export function getCategoryName(
-   locale: Locale,
-   cat: { slug: string; name_zh: string; name_en: string },
-   t: (key: string) => string,
- ): string {
-   const i18nKey = `category.${cat.slug}`;
-   const translated = t(i18nKey);
-   if (translated === i18nKey) {
-     return pickLocalizedText(locale, { zh: cat.name_zh, en: cat.name_en });
-   }
-   return translated;
- }

- /**
-  * Resolve badge display text.
-  * Uses per-product DB text if available (allows custom overrides);
-  * otherwise falls back to i18n key derived from badge_type.
-  * (Transitional — override logic removed in Phase 3)
-  */
- export function getBadgeText(
-   locale: Locale,
-   badge: {
-     badge_type: string;
-     badge_text_zh: string | null;
-     badge_text_en: string | null;
-   },
-   t: (key: string) => string,
- ): string {
-   const override = pickLocalizedText(locale, {
-     zh: badge.badge_text_zh,
-     en: badge.badge_text_en,
-   });
-   if (override) return override;
-   return t(`badge.${badge.badge_type}`);
- }
```

These helpers are no longer needed — components use `t()` directly.

### Step 3.6 — Update Frontend Components

#### `frontend/src/components/product/category-pills.tsx`

```diff
- import { pickLocalizedText } from '@/i18n/utils';
  ...
- {getCategoryName(locale, cat, t)}
+ {t(`category.${cat.slug}`)}
```

#### `frontend/src/components/product/product-card.tsx`

```diff
- import { pickLocalizedText } from '@/i18n/utils';
- import { getCategoryName, getBadgeText } from '@/i18n/utils';
  ...
- const categoryName = getCategoryName(locale, product.category, t);
+ const categoryName = t(`category.${product.category.slug}`);

- const badgeText = product.badge_type
-   ? getBadgeText(locale, product, t)
-   : null;
+ const badgeText = product.badge_type ? t(`badge.${product.badge_type}`) : null;
```

#### `frontend/src/components/product/product-editorial.tsx`

```diff
- const categoryName = getCategoryName(locale, product.category, t);
+ const categoryName = t(`category.${product.category.slug}`);

  // Badge
- {getBadgeText(locale, product, t)}
+ {t(`badge.${product.badge_type}`)}

  // Spec labels
- {pickLocalizedText(locale, { zh: spec.label_zh, en: spec.label_en })}
+ {t(`spec.${spec.label_key}`)}
```

> **Note**: Spec **values** remain bilingual: `pickLocalizedText(locale, { zh: spec.value_zh, en: spec.value_en })` — unchanged.

### Step 3.7 — Update Frontend Cart / Add-to-Cart Code

#### `frontend/src/hooks/use-add-to-cart-handler.ts`

```diff
  addToCart({
    productId,
    product: {
      id: product.id,
      name_zh: product.name_zh,
      name_en: product.name_en,
      price: product.price,
      image_url: product.image_url,
-     category_name_zh: product.category.name_zh,
-     category_name_en: product.category.name_en,
+     category_slug: product.category.slug,
    },
  });
```

#### `frontend/src/queries/use-cart.ts` — optimistic new item

```diff
  product: {
-   id: productId,
-   name_zh: '',
-   name_en: '',
-   price: productPrice,
-   image_url: null,
-   category_name_zh: '',
-   category_name_en: '',
+   ...product,
  },
```

(Already refactored by the in-progress changes — just verify `category_slug` is present.)

### Step 3.8 — Update Test Mock Data

#### `frontend/src/app/cart/page.spec.tsx`

```diff
  product: {
    name_zh: 'Bread',
    name_en: 'Bread',
    price: 100,
    image_url: null,
-   category_name_zh: 'Bread',
-   category_name_en: 'Bread',
+   category_slug: 'bread',
  },
```

#### `frontend/src/queries/use-cart.spec.tsx`

```diff
  product: {
    id: 42,
    name_zh: '蛋糕',
    name_en: 'Cake',
    price: 120,
    image_url: null,
-   category_name_zh: '蛋糕',
-   category_name_en: 'Cake',
+   category_slug: 'cake',
  },
```

#### Backend test files

Update any cart/order service spec files that mock category or badge locale fields.

---

## Summary of All Files Changed (Phase 1–3 Combined)

### Phase 1–2 (Frontend Only)

| File | Change |
|------|--------|
| `frontend/src/i18n/zh.json` | Add `category.*`, `badge.*` keys |
| `frontend/src/i18n/en.json` | Add `category.*`, `badge.*` keys |
| `frontend/src/i18n/utils.ts` | Add transitional `getCategoryName()`, `getBadgeText()` |
| `frontend/src/components/product/category-pills.tsx` | Use `getCategoryName()` |
| `frontend/src/components/product/product-card.tsx` | Use `getCategoryName()`, `getBadgeText()` |
| `frontend/src/components/product/product-editorial.tsx` | Use `getCategoryName()`, `getBadgeText()` |

### Phase 3 (Full Stack)

| Layer | File | Change |
|-------|------|--------|
| **DB** | Supabase migration | Drop columns, migrate specs JSONB |
| **Shared** | `shared/src/types/product.ts` | Remove `name_zh`/`name_en` from Category, `badge_text_zh`/`badge_text_en` from Product, `label_zh`/`label_en` → `label_key` in ProductSpec |
| **Shared** | `shared/src/types/cart.ts` | `category_name_zh`/`category_name_en` → `category_slug` |
| **Backend** | `backend/src/cart/cart.service.ts` | Category join `(name_zh, name_en)` → `(slug)`, map `category_slug` |
| **Backend** | `backend/src/order/order.service.ts` | Same join changes in `createOrder()` + `normalizeCheckoutCart()` |
| **Frontend** | `frontend/src/i18n/zh.json` | Add `spec.*` keys |
| **Frontend** | `frontend/src/i18n/en.json` | Add `spec.*` keys |
| **Frontend** | `frontend/src/i18n/utils.ts` | Remove `getCategoryName()`, `getBadgeText()` (use `t()` directly) |
| **Frontend** | `frontend/src/components/product/category-pills.tsx` | `t('category.${slug}')` directly |
| **Frontend** | `frontend/src/components/product/product-card.tsx` | `t('category.${slug}')`, `t('badge.${type}')` directly |
| **Frontend** | `frontend/src/components/product/product-editorial.tsx` | Same + `t('spec.${label_key}')` for spec labels |
| **Frontend** | `frontend/src/hooks/use-add-to-cart-handler.ts` | Pass `category_slug` |
| **Frontend** | `frontend/src/queries/use-cart.ts` | Optimistic item uses `category_slug` |
| **Tests** | `frontend/src/app/cart/page.spec.tsx` | Update mock data |
| **Tests** | `frontend/src/queries/use-cart.spec.tsx` | Update mock data |
| **Tests** | `backend/src/cart/cart.service.spec.ts` | Update mock data |

---

## Testing Checklist

### Phase 1–2

- [ ] Category pills render correct names in both `zh` and `en`
- [ ] Product cards show correct category label and badge text in both locales
- [ ] Product editorial shows correct category, badge, and spec labels
- [ ] Locale toggle switches all text instantly
- [ ] Existing tests pass (`cd frontend && npm run test`)

### Phase 3

- [ ] DB migration runs without errors on a development/staging copy
- [ ] `npm run build` succeeds (shared types compile)
- [ ] Backend starts without errors after migration
- [ ] `GET /api/categories` returns objects without `name_zh`/`name_en`
- [ ] `GET /api/products` returns objects without `badge_text_zh`/`badge_text_en`, specs use `label_key`
- [ ] `GET /api/cart` returns items with `category_slug` instead of `category_name_zh`/`category_name_en`
- [ ] Cart page renders correctly (category slug resolved via i18n)
- [ ] Product spec labels render correctly via `t('spec.${label_key}')`
- [ ] Spec values still display correct bilingual text
- [ ] Order creation still works (product name snapshot preserved in order_items)
- [ ] Order detail page still renders correctly
- [ ] Add-to-cart optimistic updates show correct category name
- [ ] All frontend tests pass (`cd frontend && npm run test`)
- [ ] All backend tests pass (`cd backend && npm run test`)

---

## Enum Summary: What DB Stores vs. What FE Displays

| Data | DB Column | FE i18n Key | Example |
|------|-----------|-------------|---------|
| Category name | `categories.slug` | `t('category.${slug}')` | `toast` → "吐司" / "Toast" |
| Badge text | `products.badge_type` | `t('badge.${type}')` | `seasonal` → "季節限定" / "Seasonal" |
| Spec label | `specs[].label_key` | `t('spec.${key}')` | `weight` → "重量" / "Weight" |
| Order status | `orders.status` | `t('status.${status}')` | `pending` → "待付款" / "Pending" |
| **Product name** | `products.name_zh/en` | `pickLocalizedText()` | Dynamic, stays bilingual |
| **Product desc** | `products.description_zh/en` | `pickLocalizedText()` | Dynamic, stays bilingual |
| **Spec value** | `specs[].value_zh/en` | `pickLocalizedText()` | Dynamic, stays bilingual |
| **Order item name** | `order_items.product_name_zh/en` | `pickLocalizedText()` | Historical snapshot |
