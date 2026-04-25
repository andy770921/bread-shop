# Implementation Plan: Admin Frontend

## Overview

Adds two new sections to the existing 功能開關 (Feature Flags) page at `admin-frontend/src/routes/dashboard/feature-flags/FeatureFlags.tsx`:

1. **`ShippingSettingsSection`** — on/off Switch + two numeric Inputs (shown only when on) for shipping fee and free-shipping threshold; saves through `PUT /api/admin/feature-flags/shop-settings`.
2. **`PromoBannerSection`** — on/off Switch only; preview line that resolves the live `banner.text` value via `useContentT` and a deep link to `/dashboard/content` for editing.

Both sections share the existing `useFeatureFlags()` query (which now returns `{ homeVisibleCategoryIds, shopSettings }`) and a new `useUpdateShopSettings()` mutation.

The existing `<HomeVisibleCategoriesSection />` is unchanged.

## Files to Modify

### New files

- `admin-frontend/src/components/feature-flags/ShippingSettingsSection.tsx`
- `admin-frontend/src/components/feature-flags/PromoBannerSection.tsx`
- `admin-frontend/src/components/feature-flags/__tests__/ShippingSettingsSection.spec.tsx`
- `admin-frontend/src/components/feature-flags/__tests__/PromoBannerSection.spec.tsx`
- `admin-frontend/src/components/ui/switch.tsx` (only if not already present — the Feature Flags page currently uses `<Checkbox>`; a real on/off switch fits the toggle semantics better)

### Modified files

- `admin-frontend/src/routes/dashboard/feature-flags/FeatureFlags.tsx` — compose the two new sections.
- `admin-frontend/src/queries/useFeatureFlags.ts` — broaden the query response type; add `useUpdateShopSettings`.
- `admin-frontend/src/i18n/zh.json` and `admin-frontend/src/i18n/en.json` — add `featureFlags.shipping.*` and `featureFlags.promoBanner.*` keys.

## Step-by-Step Implementation

### Step 1: i18n keys

Append to `admin-frontend/src/i18n/zh.json` (under existing `featureFlags`):

```json
"featureFlags": {
  "title": "功能開關",
  "homeCategoriesTitle": "首頁顯示類別",
  "homeCategoriesHelp": "...",
  "save": "儲存",
  "saving": "儲存中…",
  "saved": "已儲存",
  "saveFailed": "儲存失敗",
  "selectAtLeastOne": "請至少選擇一個類別",

  "shipping": {
    "title": "運費開關",
    "help": "關閉後所有訂單免運費；打開後依下方金額計算。",
    "enabledLabel": "啟用運費",
    "feeLabel": "運費 (NT$)",
    "thresholdLabel": "滿額免運門檻 (NT$)",
    "thresholdHelp": "訂單金額達到此數字以上免運費，0 代表永不免運。",
    "errorFeeRange": "運費需介於 0–9999 之間",
    "errorThresholdRange": "免運門檻需介於 0–999999 之間"
  },
  "promoBanner": {
    "title": "首頁促銷訊息",
    "help": "控制首頁是否顯示促銷橫幅；文字內容請至「文案管理」編輯 banner.text。",
    "enabledLabel": "顯示橫幅",
    "previewLabel": "目前文案",
    "editLink": "前往文案管理"
  }
}
```

Mirror in `en.json` with English text. Do not introduce a parallel translation system — this matches the existing FeatureFlags strings exactly.

**Rationale:** Same nesting pattern as FEAT-10 `pickupConfig.schedule.*`. Error messages live next to the labels so the form component can pull them via `t()` without prop-drilling.

### Step 2: `useFeatureFlags` extension

**File:** `admin-frontend/src/queries/useFeatureFlags.ts`

The existing hook already imports `FeatureFlagsResponse` from `@repo/shared`. Once `shared/src/types/feature-flags.ts` is widened to include `shopSettings: ShopSettings` (see `backend-api.md` Step 1), this hook needs **no** local interface — keep using the canonical shared type so the backend response and the FE type stay coupled. Do **not** introduce a parallel local `FeatureFlagsResponse`; that would shadow the shared type and silently drift.

`defaultFetchFn` is `(path: string, options?: FetchOptions<TBody>)` — the body field accepts a raw object that `fetchApi` stringifies internally. Mirror `useUpdateHomeVisibleCategories` byte-for-byte:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FeatureFlagsResponse,
  ShopSettings,
  UpdateHomeVisibleCategoriesRequest,
  UpdateShopSettingsRequest,
} from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

const KEY = ['api', 'admin', 'feature-flags'] as const;

export function useFeatureFlags() {
  return useQuery<FeatureFlagsResponse>({ queryKey: KEY });
}

export function useUpdateHomeVisibleCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateHomeVisibleCategoriesRequest) =>
      defaultFetchFn<FeatureFlagsResponse, UpdateHomeVisibleCategoriesRequest>(
        '/api/admin/feature-flags/home-visible-categories',
        { method: 'PUT', body },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['api', 'categories'] });
    },
  });
}

export function useUpdateShopSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateShopSettingsRequest) =>
      defaultFetchFn<ShopSettings, UpdateShopSettingsRequest>(
        '/api/admin/feature-flags/shop-settings',
        { method: 'PUT', body },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
```

**Rationale:** This signature exactly mirrors `useUpdatePickupSettings` (`admin-frontend/src/queries/usePickupConfig.ts`) and the pre-existing `useUpdateHomeVisibleCategories`. Two earlier-draft mistakes are explicitly avoided here:

1. **Path, not query key.** `defaultFetchFn` takes a **string path**, not a `{ queryKey }` object — passing a query key would resolve to `[object Object]` at runtime.
2. **Raw body, not `JSON.stringify`.** `fetchApi` stringifies internally; passing `JSON.stringify(dto)` would double-encode and the server would receive an escaped string instead of an object.

### Step 3: `ShippingSettingsSection`

**File:** `admin-frontend/src/components/feature-flags/ShippingSettingsSection.tsx` (new)

```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ShopSettings } from '@repo/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { useUpdateShopSettings } from '@/queries/useFeatureFlags';

interface Props {
  initial: ShopSettings;
}

export function ShippingSettingsSection({ initial }: Props) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(initial);
  const update = useUpdateShopSettings();

  useEffect(() => setDraft(initial), [initial]);

  const dirty =
    draft.shippingEnabled !== initial.shippingEnabled ||
    draft.shippingFee !== initial.shippingFee ||
    draft.freeShippingThreshold !== initial.freeShippingThreshold;

  async function handleSave() {
    if (draft.shippingEnabled) {
      if (draft.shippingFee < 0 || draft.shippingFee > 9999) {
        toast.error(t('featureFlags.shipping.errorFeeRange'));
        return;
      }
      if (draft.freeShippingThreshold < 0 || draft.freeShippingThreshold > 999999) {
        toast.error(t('featureFlags.shipping.errorThresholdRange'));
        return;
      }
    }
    try {
      await update.mutateAsync(draft);
      toast.success(t('featureFlags.saved'));
    } catch (err) {
      toast.error((err as Error).message || t('featureFlags.saveFailed'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-serif text-lg font-bold text-text-primary">
            {t('featureFlags.shipping.title')}
          </h2>
          <p className="text-sm text-text-secondary">{t('featureFlags.shipping.help')}</p>
        </div>

        <Label className="flex items-center gap-3">
          <Switch
            checked={draft.shippingEnabled}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, shippingEnabled: Boolean(v) }))}
          />
          {t('featureFlags.shipping.enabledLabel')}
        </Label>

        {draft.shippingEnabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="shippingFee">{t('featureFlags.shipping.feeLabel')}</Label>
              <Input
                id="shippingFee"
                type="number"
                min={0}
                max={9999}
                value={draft.shippingFee}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, shippingFee: Number(e.target.value) }))
                }
                className="mt-1 w-32"
              />
            </div>
            <div>
              <Label htmlFor="freeShippingThreshold">
                {t('featureFlags.shipping.thresholdLabel')}
              </Label>
              <Input
                id="freeShippingThreshold"
                type="number"
                min={0}
                max={999999}
                value={draft.freeShippingThreshold}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, freeShippingThreshold: Number(e.target.value) }))
                }
                className="mt-1 w-40"
              />
              <p className="mt-1 text-xs text-text-tertiary">
                {t('featureFlags.shipping.thresholdHelp')}
              </p>
            </div>
          </div>
        )}

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

- The two numeric inputs are conditionally rendered (`{draft.shippingEnabled && ...}`), not just disabled, so the section visually matches the simpler "off" state.
- `draft` is held independently of the mutated server state so the admin can toggle off → on without losing the previously saved fee/threshold values (the server still has them).
- Validation runs only when `shippingEnabled === true`. If the admin saves with shipping off, the persisted fee/threshold remain whatever they were last set to — useful for "turn promo off, return to normal" workflows.
- The save button is disabled until something changed (`dirty`), matching the existing `HomeVisibleCategoriesSection` UX.

### Step 4: `PromoBannerSection`

**File:** `admin-frontend/src/components/feature-flags/PromoBannerSection.tsx` (new)

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { ShopSettings } from '@repo/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { useContentT } from '@/hooks/use-content-t';
import { useUpdateShopSettings } from '@/queries/useFeatureFlags';

interface Props {
  initial: ShopSettings;
}

export function PromoBannerSection({ initial }: Props) {
  const { t } = useLocale();
  const contentT = useContentT();
  const [enabled, setEnabled] = useState(initial.promoBannerEnabled);
  const update = useUpdateShopSettings();

  useEffect(() => setEnabled(initial.promoBannerEnabled), [initial.promoBannerEnabled]);

  const dirty = enabled !== initial.promoBannerEnabled;

  async function handleSave() {
    try {
      await update.mutateAsync({ ...initial, promoBannerEnabled: enabled });
      toast.success(t('featureFlags.saved'));
    } catch (err) {
      toast.error((err as Error).message || t('featureFlags.saveFailed'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-serif text-lg font-bold text-text-primary">
            {t('featureFlags.promoBanner.title')}
          </h2>
          <p className="text-sm text-text-secondary">{t('featureFlags.promoBanner.help')}</p>
        </div>

        <Label className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
          {t('featureFlags.promoBanner.enabledLabel')}
        </Label>

        <div className="rounded-md border border-border-default bg-bg-surface px-3 py-2">
          <p className="text-xs text-text-tertiary">{t('featureFlags.promoBanner.previewLabel')}</p>
          <p className="text-sm font-medium text-text-primary">{contentT('banner.text')}</p>
          <Link
            to="/dashboard/content"
            className="mt-1 inline-block text-xs text-primary-500 underline"
          >
            {t('featureFlags.promoBanner.editLink')}
          </Link>
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

- The mutation payload sends the *full* `ShopSettings` object — same as `ShippingSettingsSection`. The PUT endpoint accepts a complete settings replacement so neither section can clobber the other when one is saved (each uses the latest `initial` from the shared query as its base).
- `useContentT('banner.text')` resolves the live override or default — same hook the customer banner uses. The admin sees what the customer sees, in the current admin locale.
- **Caveat — `banner.text` may not appear in 文案管理 on a fresh deploy.** The admin content editor at `admin-frontend/src/lib/content-keys.ts` builds its key list from rows already present in the `site_content` table, not from the i18n defaults. On day zero there is no `site_content` row for `banner.text`, so the deep link "前往文案管理" will land on a page that does not list `banner.text`. To make the link useful out of the box, **seed `banner.text` into `site_content` as part of the FEAT-12 migration** (apply via Supabase MCP):

  ```sql
  INSERT INTO public.site_content (key, value_zh, value_en)
  VALUES ('banner.text', '限時優惠：滿NT$500享免運', 'Limited Offer: Free Shipping on Orders Over NT$500')
  ON CONFLICT (key) DO NOTHING;
  ```

  Without this seed the admin will need to insert a row by other means before they can edit the banner text — a confusing first-run experience. Treat the seed as part of the FEAT-12 migration plan, not an optional polish step.
- The "前往文案管理" link uses `react-router-dom`'s `<Link>` (not a hard `<a href>`) — the admin app is a SPA and the content editor is a sibling route under `/dashboard`.

### Step 5: Compose into Feature Flags page

**File:** `admin-frontend/src/routes/dashboard/feature-flags/FeatureFlags.tsx`

```tsx
import { useLocale } from '@/hooks/use-locale';
import { useFeatureFlags } from '@/queries/useFeatureFlags';
import { HomeVisibleCategoriesSection } from '@/components/feature-flags/HomeVisibleCategoriesSection';
import { ShippingSettingsSection } from '@/components/feature-flags/ShippingSettingsSection';
import { PromoBannerSection } from '@/components/feature-flags/PromoBannerSection';

export default function FeatureFlags() {
  const { t } = useLocale();
  const { data } = useFeatureFlags();
  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="font-serif text-lg font-bold text-text-primary md:text-2xl">
        {t('featureFlags.title')}
      </h1>
      <HomeVisibleCategoriesSection />
      {data?.shopSettings && (
        <>
          <ShippingSettingsSection initial={data.shopSettings} />
          <PromoBannerSection initial={data.shopSettings} />
        </>
      )}
    </div>
  );
}
```

**Rationale:** The two new sections render only after the query resolves; pre-load they show nothing rather than a janky empty card. `<HomeVisibleCategoriesSection />` keeps its independent query lifecycle since it manages a different mutation key.

### Step 6: `Switch` primitive

**Already present — no work required.** `admin-frontend/src/components/ui/switch.tsx` exists and is implemented over the umbrella `radix-ui` package, not `@radix-ui/react-switch`. The earlier "install Radix Switch" instruction was wrong for this codebase. The `ShippingSettingsSection` and `PromoBannerSection` snippets above import `Switch` directly — no install, no new file.

## Testing Steps

1. **Unit — `ShippingSettingsSection.spec.tsx`:**
   - Toggle off → numeric inputs disappear from the DOM.
   - Toggle on → both inputs render with seeded values.
   - Set fee = -1, click save → `toast.error` with `errorFeeRange`; mutation not called.
   - Valid save → mutation called with the full `ShopSettings` payload.
2. **Unit — `PromoBannerSection.spec.tsx`:**
   - Initial render shows the current `banner.text` resolved through `useContentT`.
   - Toggling and saving fires `useUpdateShopSettings` with `promoBannerEnabled` flipped.
   - The "前往文案管理" link points at `/dashboard/content`.
3. **Manual:**
   - Log in as admin, navigate to 功能開關.
   - Switch shipping off → save → open customer cart in another tab → after a 30s window or hard refresh, `shipping_fee = 0` regardless of subtotal.
   - Switch promo banner off → save → reload customer home → banner is gone.

## Dependencies

- Must complete after: `backend-api.md` (the endpoints must exist for the mutation to succeed in dev).
- Independent of: `customer-frontend.md` (the admin page does not render customer banners).

## Notes

- The existing `useUpdateHomeVisibleCategories` mutation invalidates the same `['api','admin','feature-flags']` key — there is no risk of one section's save wiping the other's local draft, because each section's draft is held in its own `useState` and re-seeded from the shared query whenever it refreshes.
- Avoid hoisting the draft state into `FeatureFlags.tsx`. Each section owns its own draft so the dirty-check / disabled-save logic stays local.
- If a future ticket adds *another* shop-wide setting (e.g. "store closed today"), it can land as a third section that also reads from `data.shopSettings` and reuses `useUpdateShopSettings` — the wire format already accepts the complete object.
