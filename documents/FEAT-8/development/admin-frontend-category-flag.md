# Implementation Note: Strict Hiding for `visible_on_home`

## Why this note exists

The original FEAT-8 PRD (`plans/prd.md` line ~75) deliberately scoped
`categories.visible_on_home` to be a **pill-only** flag — the customer
`GET /api/categories` returned every row including hidden ones, and
`GET /api/products` did **no** category-side filtering. The customer
front end's `<CategoryPills>` was the only place that filtered, hiding
the pill button for `visible_on_home = false`.

That worked as designed but produced a behavioural surprise: when a
customer clicked the **「全部」** (All) pill on the home page, products
belonging to *unchecked* categories still appeared in the grid. The
admin's intent ("hide this category from the home page") was honoured
for the pill rack but not for the catch-all listing the pill rack sits
above. From the customer's perspective the unchecked category's
products were unreachable through the UI's filter, yet visible in the
default view — visually inconsistent with the admin toggle's name.

This document records the decision to switch to **strict hiding**: an
unchecked category is treated as fully hidden from every public product
listing path, not just from the pill rack.

## Behavioural change

| Surface | Before | After |
| --- | --- | --- |
| Home pill rack (`<CategoryPills>`) | Hidden when `visible_on_home = false` | unchanged |
| `GET /api/products` (no `category=` query) | Returned products from **every** active category | Returns products **only** from `visible_on_home = true` categories |
| `GET /api/products?category=<slug-of-hidden-category>` | Returned products of that category | Returns `[]` (the join now filters out the hidden category) |
| `GET /api/products/:id` for a product whose category is hidden | Returned the product | unchanged — the detail endpoint stays accessible by id |
| `GET /api/categories` | Lists every row including hidden | unchanged — the admin form needs the full list |
| Admin product list / admin product edit | unchanged | unchanged — admin paths are untouched |

The detail endpoint (`findOne`) is intentionally **not** filtered. A
product whose category gets hidden mid-checkout (race) should still
resolve so the customer's order detail page renders. The hiding rule
applies to *discovery* (listings), not to direct lookups by id.

## Code changes

### `backend/src/product/product.service.ts`

`findAll(categorySlug?)` previously had two branches: one with
`categories(*)` (left join, returns all products regardless of category
visibility) and one with `categories!inner(*) ... .eq('categories.slug', X)`
(inner join filtered to the requested slug). Both branches now use a
single inner-join chain with an unconditional
`.eq('categories.visible_on_home', true)` filter:

```ts
let query = supabase
  .from('products')
  .select('*, category:categories!inner(*)')
  .eq('is_active', true)
  .eq('categories.visible_on_home', true)
  .order('sort_order', { ascending: true });

if (categorySlug) {
  query = query.eq('categories.slug', categorySlug);
}
```

`findOne(id)` is **unchanged** — see the table above for the rationale.

### `admin-frontend/src/i18n/{zh,en}.json` — `featureFlags.homeCategoriesHelp`

The helper text under the toggle previously said "Unticked categories
still accept product assignments; they just aren't advertised on the
home page." Updated to make the new strict semantics explicit:

- zh: 「未勾選的類別會從首頁完全隱藏：分類按鈕不顯示，且該分類底下的商品在「全部」也不會出現（仍可用於商品歸類，只是不在前台顯示）。」
- en: "Unticked categories are hidden from the storefront entirely: the pill is removed AND their products no longer appear under 'All'. Products can still be assigned to these categories — they just aren't shown publicly until the category is re-ticked."

## Edge cases

- **Mid-session admin toggle**: an admin un-ticks a category while a
  customer is on the home page. The customer's open page still shows
  cached products from that category until the next refetch (TanStack
  Query default `staleTime: 60s`). The next navigation or refetch will
  drop those products. No optimistic invalidation is wired across the
  two frontends — acceptable because admin-toggle traffic is low and
  the backend is the source of truth on every fresh request.
- **Existing orders with products from a now-hidden category**: orders
  are read via `OrderService.getOrderWithItems` and friends, which
  query `orders` / `order_items` directly with no `categories` join.
  Hiding a category does **not** retroactively orphan historical
  order rows. The order detail page continues to render the product
  name (snapshot stored on `order_items.product_name_zh/en`) and the
  customer-facing order pages keep working.
- **Direct deep link to a hidden category's product detail page**:
  works (see `findOne` behaviour above). If the team later wants to
  block this too, switch `findOne` to inner-join on
  `categories.visible_on_home = true` and treat absence as 404 — but
  that creates a 404 the moment a category is hidden mid-flow, which
  is more user-hostile than the current "still resolvable by id"
  behaviour.
- **No backfill needed**: existing rows already have
  `visible_on_home = true` (column default from the FEAT-8 migration).
  The behavioural change is forward-only.

## Rationale

The pill-only design from the original FEAT-8 PRD optimised for
*"the toggle is purely a UI affordance, server-side stays simple"*.
The strict-hiding design here optimises for *"the toggle's behaviour
should match the admin's mental model: tick = visible, untick =
hidden"*. The latter is what shop owners expect when they look at a
checkbox labelled 「首頁顯示類別」 — they read it as a publish/unpublish
switch for the category, not as a pill-rack-only cosmetic flag.

The added `.eq('categories.visible_on_home', true)` is a single
predicate against an already-joined table — no measurable performance
impact at Papa Bakery's scale.

## Out of scope

- **Per-product home visibility**. We're not adding
  `products.visible_on_home`. Hiding a category hides every product
  underneath, and that is the only granularity offered.
- **Admin "preview as customer"**. No way to preview the home page as a
  customer would see it after toggling. Admins must un-tick, refresh
  the customer site in another tab, then re-tick if they change their
  mind. Acceptable for a low-cadence operation.
- **Time-bounded hiding** ("hide this category until next Monday").
  The admin must remember to re-tick. No scheduled job.
