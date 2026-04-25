# Implementation Plan: Admin Frontend

## Overview

Per the design at `/Users/andy.cyh/Desktop/截圖 2026-04-25 中午12.49.36.png`, the existing 商品管理 *list* page gains two top-level tabs at the very top of the content area:

- **`編輯商品`** — the existing list (table + 新增商品 button + filters), unchanged.
- **`庫存設定`** — a new card with one dropdown (`不設定庫存` / `每日總量`), a numeric input that appears only when `每日總量` is chosen, and a `儲存` button.

The per-product `<ProductForm>` is **not** wrapped in tabs and is **not** changed. The tabs live exclusively on the list route.

## Files to Modify

### New files

- `admin-frontend/src/components/products/InventorySettingsSection.tsx` — the second tab's content.

### Modified files

- `admin-frontend/src/routes/dashboard/products/ProductList.tsx` — wrap the existing content in `<Tabs>` from `@/components/ui/tabs.tsx` and add the second tab panel.
- `admin-frontend/src/components/products/ProductForm.tsx` — add two `<Textarea>` fields for `ingredients_zh` / `ingredients_en` under the existing `descriptionZh` / `descriptionEn` row (same two-column grid). The form **lives under `components/products/`, not under `routes/dashboard/products/`** — the route directory only contains `ProductList.tsx`, `ProductNew.tsx`, `ProductEdit.tsx`. The Zod schema is at lines 25-39; insert the new fields right after `description_en`. Also widen `defaultValues` and the `reset(...)` body inside the existing `useEffect` so edits round-trip into the form on initial mount.
- `admin-frontend/src/queries/useFeatureFlags.ts` — already has `useFeatureFlags()` and `useUpdateShopSettings()` (FEAT-12). No new queries needed; the inventory section reuses them because both new fields live on `shop_settings`.
- `admin-frontend/src/i18n/zh.json` and `admin-frontend/src/i18n/en.json` — add `product.tabs.*`, `product.inventory.*`, and `product.ingredientsZh` / `product.ingredientsEn` keys.

### Shared

- No new shared types beyond what `backend-api.md` Step 1 already adds.

## Step-by-Step Implementation

### Step 1: i18n keys

`admin-frontend/src/i18n/zh.json` already has a `product.*` namespace (`title, new, edit, delete, nameZh, nameEn, descriptionZh, descriptionEn, …, specs, …`). The new keys nest cleanly under that existing block. Add `product.ingredientsZh`, `product.ingredientsEn`, `product.tabs.*`, and `product.inventory.*` as **sub-entries inside the existing `product` object** — do **not** create sibling top-level `tabs:` or `inventory:` blocks. zh.json:

```json
"product": {
  "title": "商品管理",
  /* ...existing keys... */
  "ingredientsZh": "成分（中文）",
  "ingredientsEn": "成分（英文）",
  "tabs": {
    "edit": "編輯商品",
    "inventory": "庫存設定"
  },
  "inventory": {
    "title": "庫存設定",
    "help": "選擇「不設定庫存」時所有商品可無限加入購物車。選擇「每日總量」時，每天最多接受指定的商品總數量。",
    "modeLabel": "庫存模式",
    "modeUnlimited": "不設定庫存",
    "modeDailyTotal": "每日總量",
    "limitLabel": "每日上限數量",
    "limitHelp": "每天最多接受的商品總數量（含所有商品）。",
    "errorLimitRange": "上限需介於 1–999 之間"
  }
}
```

Mirror in `en.json` with `Edit Products` / `Inventory` / `Unlimited` / `Daily Total` / `Daily limit (items)` / etc.

**Rationale:** Same nested namespace pattern as FEAT-10 / FEAT-12. All error messages live next to the labels so the form pulls them via `t()` without prop-drilling.

### Step 2: `InventorySettingsSection`

**File:** `admin-frontend/src/components/products/InventorySettingsSection.tsx` (new)

```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { InventoryMode, ShopSettings } from '@repo/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/hooks/use-locale';
import { useFeatureFlags, useUpdateShopSettings } from '@/queries/useFeatureFlags';
import { extractErrorMessage } from '@/lib/extract-error-message';

export function InventorySettingsSection() {
  const { t } = useLocale();
  const { data } = useFeatureFlags();
  const update = useUpdateShopSettings();
  const initial = data?.shopSettings;
  const [mode, setMode] = useState<InventoryMode>(initial?.inventoryMode ?? 'unlimited');
  const [limit, setLimit] = useState<number>(initial?.dailyTotalLimit ?? 3);

  useEffect(() => {
    if (!initial) return;
    setMode(initial.inventoryMode);
    setLimit(initial.dailyTotalLimit);
  }, [initial]);

  if (!initial) return null;

  const dirty = mode !== initial.inventoryMode || limit !== initial.dailyTotalLimit;

  async function handleSave() {
    if (mode === 'daily_total') {
      if (!Number.isInteger(limit) || limit < 1 || limit > 999) {
        toast.error(t('product.inventory.errorLimitRange'));
        return;
      }
    }
    const next: ShopSettings = { ...initial!, inventoryMode: mode, dailyTotalLimit: limit };
    try {
      await update.mutateAsync(next);
      toast.success(t('featureFlags.saved'));
    } catch (err) {
      toast.error(`${t('featureFlags.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-serif text-lg font-bold text-text-primary">
            {t('product.inventory.title')}
          </h2>
          <p className="text-sm text-text-secondary">{t('product.inventory.help')}</p>
        </div>

        <div className="grid gap-4 sm:max-w-md">
          <div>
            <Label htmlFor="inventoryMode">{t('product.inventory.modeLabel')}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as InventoryMode)}>
              <SelectTrigger id="inventoryMode" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unlimited">{t('product.inventory.modeUnlimited')}</SelectItem>
                <SelectItem value="daily_total">{t('product.inventory.modeDailyTotal')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'daily_total' && (
            <div>
              <Label htmlFor="dailyTotalLimit">{t('product.inventory.limitLabel')}</Label>
              <Input
                id="dailyTotalLimit"
                type="number"
                min={1}
                max={999}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="mt-1 w-32"
              />
              <p className="mt-1 text-xs text-text-tertiary">
                {t('product.inventory.limitHelp')}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || update.isPending}>
            {update.isPending ? t('featureFlags.saving') : t('featureFlags.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Rationale:**

- Reuses `useFeatureFlags()` and `useUpdateShopSettings()` from FEAT-12 — both already widen the `ShopSettings` payload with the two new fields once `backend-api.md` Step 1 ships. No new query hook.
- `<Select>` is the project's existing primitive (`admin-frontend/src/components/ui/select.tsx`, used by other admin forms). The `<Input type="number">` only appears when `mode === 'daily_total'`, matching the design.
- Saving with `mode = 'unlimited'` still sends the current `limit` value through — the BE persists it, so flipping back to `每日總量` restores the previously-edited number. UX matches the FEAT-12 shipping pattern.

### Step 3: Tabs on the list route

**File:** `admin-frontend/src/routes/dashboard/products/ProductList.tsx`

Wrap the existing JSX in `<Tabs>` from `@/components/ui/tabs.tsx`. Skeleton:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InventorySettingsSection } from '@/components/products/InventorySettingsSection';
import { useLocale } from '@/hooks/use-locale';

export default function ProductList() {
  const { t } = useLocale();
  /* ...existing hooks unchanged... */

  return (
    <div className="space-y-4 md:space-y-6">
      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">{t('product.tabs.edit')}</TabsTrigger>
          <TabsTrigger value="inventory">{t('product.tabs.inventory')}</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="space-y-4 md:space-y-6">
          {/* existing list content moves here verbatim */}
        </TabsContent>
        <TabsContent value="inventory" className="space-y-4 md:space-y-6">
          <InventorySettingsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Rationale:**

- `<Tabs defaultValue="edit">` keeps the active tab on the existing experience by default — admins land on the page they're used to. Switching to inventory is a one-click discovery.
- The `編輯商品` tab content is the *complete* existing JSX (heading, 新增商品 button, table, pagination, all of it). Do **not** factor it into a separate `ProductManagementSection.tsx` — that adds churn for no benefit and risks losing keyboard / focus behaviour.
- The page heading `商品管理` on the design lives *inside* the `編輯商品` tab content (it is part of the existing JSX), not as a sibling header. Keep it where it was.

### Step 3b: Add `ingredients_zh` / `ingredients_en` to `ProductForm`

**File:** `admin-frontend/src/components/products/ProductForm.tsx` (NOT `routes/dashboard/products/`)

The existing form already has a `descriptionZh` / `descriptionEn` two-column row built with the same `<Textarea>` primitive that ships in `admin-frontend/src/components/ui/textarea.tsx`. Add a sibling row directly underneath:

```tsx
<div className="grid gap-4 sm:grid-cols-2">
  <div>
    <Label htmlFor="ingredientsZh">{t('product.ingredientsZh')}</Label>
    <Textarea id="ingredientsZh" rows={3} {...register('ingredients_zh')} className="mt-1" />
  </div>
  <div>
    <Label htmlFor="ingredientsEn">{t('product.ingredientsEn')}</Label>
    <Textarea id="ingredientsEn" rows={3} {...register('ingredients_en')} className="mt-1" />
  </div>
</div>
```

Extend the form's Zod schema with `ingredients_zh: z.string().optional()` and `ingredients_en: z.string().optional()`. The mutation payload widens automatically once the shared `Product` type carries the two fields (see `backend-api.md` Step 6b).

**Rationale:**

- Both fields are optional. The owner can fill only Chinese, only English, both, or neither — the customer FE handles every case (PRD User Story 11).
- 3 rows is enough for typical bakery ingredient strings without dominating the form. The textarea grows on overflow per the existing primitive.
- Re-using `Textarea` (not `Input`) means the saved value can include newlines, which is desirable for multi-line ingredient lists.
- **Do not forget the `reset(...)` body inside the form's existing `useEffect` block.** `react-hook-form`'s `defaultValues` is the *initial* render; edits use `reset(initial)` on prop change. Both must include `ingredients_zh: initial.ingredients_zh ?? ''` and `ingredients_en: initial.ingredients_en ?? ''`, otherwise opening an existing product for edit will show empty ingredients fields even when the DB has values. This is the same pattern the existing `description_zh` / `description_en` use.

### Step 4: Tabs primitive sanity check

`admin-frontend/src/components/ui/tabs.tsx` already exports `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (Radix-backed via the umbrella `radix-ui` package). No install, no new file.

The primitive ships with two style variants: `default` (filled active tab via `data-active:bg-background data-active:text-foreground`) and `line` (underline-only via the `after:` pseudo on `data-state=active`). The screenshot at `/Users/andy.cyh/Desktop/截圖 2026-04-25 中午12.49.36.png` shows an underlined / text-button style — **render with `<TabsList variant="line">`**, not the default filled variant. Do not ship the default style and then add a follow-up styling pass; pick `line` up front. `defaultValue="edit"` is the standard Radix prop forwarded via `...props` to `TabsPrimitive.Root` and is fully uncontrolled — no router navigation occurs on tab switch, in-page state only.

## Testing Steps

1. **Unit (`InventorySettingsSection.spec.tsx` new):**
   - Renders `不設定庫存` selected by default; numeric input is hidden.
   - Switching to `每日總量` reveals the input pre-filled with the saved value.
   - Saving with `limit = 0` shows `errorLimitRange` toast and does *not* call the mutation.
   - A valid save invokes `useUpdateShopSettings.mutateAsync` with the full `ShopSettings` payload (all six fields, not just the two new ones).
2. **Manual (admin browser):**
   - Open `/dashboard/products` — `編輯商品` tab is active, table renders unchanged.
   - Click `庫存設定` — the card shows the dropdown defaulting to `不設定庫存`.
   - Switch to `每日總量`, leave the limit at `3`, save → toast `已儲存`.
   - Refresh; the tab remembers nothing (no URL persistence in v1, see Notes); the dropdown persists from DB.

## Dependencies

- Must complete after: `backend-api.md` (the new fields must exist on `ShopSettings` for the form to round-trip).
- Independent of: `customer-frontend.md` (no shared code with the customer cart).

## Notes

- **No URL persistence for the active tab.** The Radix `<Tabs>` primitive defaults to internal state. If the owner asks for `?tab=inventory`-style deep links later, we can swap to `value`/`onValueChange` driven by `useSearchParams`. Out of scope for v1.
- **Accessibility.** `<Tabs>` from Radix already provides `role="tablist"`, `role="tab"`, `aria-controls`, etc. No extra ARIA work in this PRD.
- **The PromoBannerSection's "前往文案管理" deep-link pattern is *not* repeated here** — there's no companion editing surface to link to. The inventory tab is fully self-contained.
- **Form validation locus.** The `>= 1` floor is enforced by the JSX `min={1}` *and* by the toast pre-check *and* by the BE DTO. Belt and braces is fine here because the cost of a wrong save is real (orders blocked or accepted incorrectly).
