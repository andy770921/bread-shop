# REFACTOR-4: Frontend i18n Enum Mapping for Product Locale

## Background

The current codebase stores bilingual text (`_zh` / `_en` suffixes) in every database row and returns both variants from the API. The frontend then picks the right one at render time via `pickLocalizedText(locale, { zh, en })`.

An in-progress refactor (current unstaged changes) has already:

1. Introduced `frontend/src/i18n/utils.ts` — helper functions (`pickLocalizedText`, `pickByLocale`, `toIntlLocale`, `getOppositeLocale`)
2. Replaced all inline `locale === 'zh' ? x_zh : x_en` ternaries with those helpers
3. Typed `locale` props as `Locale` (from `i18n/config.ts`) instead of `string`
4. Extracted a reusable `ProductImage` component

This proposal is the **next step**: for fields whose values are **enumerable and stable**, move the display text entirely into the frontend i18n JSON files and map from the enum/slug key. This eliminates redundant DB-stored translations for data that the frontend already has a natural key for.

---

## Analysis: Which Fields Can Use Enum-Based i18n?

### Already Using This Pattern (Reference)

| Field | Enum Type | Frontend Usage | Status |
|-------|-----------|----------------|--------|
| Order status | `OrderStatus` (`pending`, `paid`, `preparing`, `shipping`, `delivered`, `cancelled`) | `t('status.${order.status}')` | **Done** |

### Candidates for Refactor

| Field | Enum / Key | Current Approach | Proposed Approach |
|-------|------------|------------------|-------------------|
| **Category name** | `Category.slug` (`toast`, `cake`, `cookie`, `bread`, `other`) | `pickLocalizedText(locale, { zh: cat.name_zh, en: cat.name_en })` | `t('category.${cat.slug}')` |
| **Badge text** | `BadgeType` (`hot`, `new`, `seasonal`) | `pickLocalizedText(locale, { zh: product.badge_text_zh, en: product.badge_text_en })` | `t('badge.${product.badge_type}')` |
| **Spec labels** | Canonical label keys (`weight`, `shelf_life`, `size`, `serves`, ...) | `pickLocalizedText(locale, { zh: spec.label_zh, en: spec.label_en })` | `t('spec.${spec.label_key}')` |
| **Cart category** | `category_slug` on `CartItem.product` | `category_name_zh` / `category_name_en` from BE join | FE uses `t('category.${slug}')` |

### NOT Candidates (Dynamic Content — Must Stay Bilingual in DB)

| Field | Reason |
|-------|--------|
| Product name (`name_zh` / `name_en`) | Unique per product, truly dynamic |
| Product description (`description_zh` / `description_en`) | Unique per product |
| Product spec **values** (`value_zh` / `value_en`) | Product-specific (e.g. "450g", "3 days", "6 inch") |
| Order item product names (`product_name_zh` / `product_name_en`) | Historical snapshot — must preserve the name at order time |

---

## Proposal

### Phase 1: Category Names via i18n Keys

**Rationale**: Categories have **stable slugs** that act as natural i18n keys. The current seed data has exactly 5 categories (`toast`, `cake`, `cookie`, `bread`, `other`) and this set changes infrequently. The `slug` field is already exposed by the API and used for filtering — it's a perfect enum-like key.

**Changes**:
1. Add `category.*` keys to `zh.json` and `en.json`
2. Replace `pickLocalizedText(locale, { zh: cat.name_zh, en: cat.name_en })` with `t('category.${cat.slug}')` in:
   - `category-pills.tsx` — pill labels
   - `product-card.tsx` — category badge text
   - `product-editorial.tsx` — category label

**Fallback strategy**: If a new category slug is added in the DB but not yet in the i18n files, fall back to `pickLocalizedText(locale, { zh: cat.name_zh, en: cat.name_en })`. This keeps backward compatibility during the transition period.

### Phase 2: Badge Text via i18n Keys

**Rationale**: `BadgeType` is already a TypeScript enum (`'hot' | 'new' | 'seasonal'`). The DB stores `badge_text_zh` / `badge_text_en` per product, but in practice these are always the same text for the same badge type (e.g., `hot` → "HOT"/"HOT", `seasonal` → "季節限定"/"Seasonal", `new` → "NEW"/"NEW"). Moving to i18n eliminates this redundancy and ensures consistent badge labels.

**Changes**:
1. Add `badge.*` keys to `zh.json` and `en.json`
2. Replace badge text rendering in `product-card.tsx` and `product-editorial.tsx` with `t('badge.${product.badge_type}')`

**Note**: Phase 2 is a transitional step. Phase 3 removes `badge_text_zh`/`badge_text_en` from the DB entirely.

### Phase 3: Remove Redundant Locale Columns from DB + Enumify Spec Labels

**Rationale**: The guiding principle is **"DB stores enums, FE owns display text"**. After Phase 1–2 prove the pattern works, Phase 3 removes the now-redundant locale columns from the database and cleans up all associated backend/frontend/shared code. Spec labels are also enumified as part of this phase since they follow the same pattern.

**Principle**: Minimize bilingual data in DB. Only keep `_zh`/`_en` for truly dynamic, per-product content (product names, descriptions, spec values). Everything that can be represented by an enum key should use `BE enum → FE t(key)`.

**DB Migration**:
1. `categories` table — drop `name_zh`, `name_en` columns (slug is the canonical key)
2. `products` table — drop `badge_text_zh`, `badge_text_en` columns (badge_type is the canonical key)
3. `products.specs` JSONB — migrate from `{label_zh, label_en, value_zh, value_en}` to `{label_key, value_zh, value_en}`

**Shared Type Changes**:
1. `Category` — remove `name_zh`, `name_en` fields
2. `Product` — remove `badge_text_zh`, `badge_text_en` fields
3. `ProductSpec` — replace `label_zh`/`label_en` with single `label_key: string`
4. `CartItem.product` — replace `category_name_zh`/`category_name_en` with `category_slug: string`

**Backend Changes**:
1. `cart.service.ts` — change category join from `categories(name_zh, name_en)` to `categories(slug)`; map `category_slug`
2. `order.service.ts` — same change in both the `createOrder` canonicalization and the `normalizeCheckoutCart` flow
3. `product.service.ts` — no code changes needed (uses `*` select; columns simply disappear)

**Frontend Changes**:
1. Remove fallback helpers (`getCategoryName`, `getBadgeText`) → use `t()` directly
2. Update cart item rendering to use `category_slug` + `t('category.${slug}')`
3. Update `use-add-to-cart-handler.ts` to pass `category_slug` instead of `category_name_zh`/`category_name_en`
4. Update spec label rendering to use `t('spec.${spec.label_key}')`
5. Add `spec.*` keys to i18n JSON
6. Update all test mock data

**Canonical Spec Label Keys** (derived from current seed data):

| DB `label_key` | zh.json | en.json |
|----------------|---------|---------|
| `weight` | 重量 | Weight |
| `shelf_life` | 保鮮期 | Shelf Life |
| `prep_time` | 製作時間 | Prep Time |
| `size` | 尺寸 | Size |
| `serves` | 適用 | Serves |
| `quantity` | 數量 | Quantity |
| `packaging` | 包裝 | Packaging |
| `production` | 製作 | Production |
| `best_before` | 最佳享用 | Best Before |
| `texture` | 口感 | Texture |
| `flavor` | 風味 | Flavor |

---

## Trade-offs

### Advantages

- **Single source of truth**: Display text lives in i18n files, not scattered across DB rows
- **Consistent with existing patterns**: Order status already uses `t('status.${status}')` — this extends the same pattern to all enum-like fields
- **Easier to update**: Changing "Cookies" to "Biscuits" is a one-line i18n edit, not a DB migration
- **Smaller DB footprint**: Redundant locale columns removed — DB stores keys, not display strings
- **Smaller API payloads**: `category_slug` (1 field) replaces `category_name_zh` + `category_name_en` (2 fields) in cart items
- **Type-safe**: TypeScript can enforce that all enum values have corresponding i18n keys

### Risks

- **New categories must add i18n keys**: If a new category is added in DB without an i18n entry, the UI will show the raw slug. Mitigated by: adding categories is a rare admin operation — the i18n JSON and DB change should always be paired.
- **New spec labels must add i18n keys**: Same mitigation — adding a new spec label type requires a corresponding i18n entry.
- **DB migration required**: Phase 3 involves schema changes and JSONB data migration. Must be tested against production data backup before applying.
- **Breaking API change**: Clients consuming `name_zh`/`name_en` on categories or `badge_text_zh`/`badge_text_en` on products will break. Since this is a monorepo with a single frontend consumer, this is manageable.

---

## Scope

### Phase 1–2 (Frontend Only)

- **Files affected**: ~5 component files + 2 i18n JSON files + 1 utility file
- **Risk**: Low — purely presentational, no data flow changes
- **Reversibility**: High — can revert to `pickLocalizedText` at any time

### Phase 3 (Full Stack)

- **Layers affected**: DB migration, shared types, backend services, frontend components, tests
- **Files affected**: ~15 files across all layers
- **Risk**: Medium — schema change + shared type change requires coordinated deployment
- **Deployment**: Must deploy backend + shared types + frontend together (monorepo single deploy is fine)

---

## Out of Scope

- Changing the backend to accept a `locale` query parameter (the "return everything, pick on client" pattern is fine)
- Removing product `name_zh`/`name_en` or `description_zh`/`description_en` (truly dynamic content)
- Removing order item `product_name_zh`/`product_name_en` (historical snapshot, must preserve)
- Enumifying spec **values** (product-specific measurements like "450g", "3 days")
