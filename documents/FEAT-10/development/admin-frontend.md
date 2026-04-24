# Implementation Plan: Admin Frontend

## Overview

Adds a new top-level sidebar tab **「取貨設定」** (Pickup Config) to the admin app, wired to the backend endpoints `GET/PUT /api/admin/pickup-settings` and `GET/POST/PATCH/DELETE /api/admin/pickup-locations`.

The page has two cards:

1. **地點管理** — list existing locations; add / rename / soft-delete.
2. **時段設定** — checkbox grid for time slots 15:00–22:00 (hourly), weekday blackout checkboxes Mon–Sun, closure-range calendar picker, `window_days` text input.

Also extends the existing admin order detail view so pickup method, location, and timestamp are visible for fulfillment.

## Files to Modify

### New files

- `admin-frontend/src/routes/dashboard/pickup-config/PickupConfigPage.tsx`
- `admin-frontend/src/routes/dashboard/pickup-config/LocationManager.tsx`
- `admin-frontend/src/routes/dashboard/pickup-config/ScheduleSettings.tsx`
- `admin-frontend/src/routes/dashboard/pickup-config/ClosureRangePicker.tsx`
- `admin-frontend/src/queries/usePickupConfig.ts`
- `admin-frontend/src/components/ui/calendar.tsx` (only if closure-range picker uses it — see Step 4 alternative)
- `admin-frontend/src/components/ui/popover.tsx`
- `admin-frontend/src/routes/dashboard/pickup-config/__tests__/ScheduleSettings.test.tsx`

### Modified files

- `admin-frontend/package.json` — add `react-day-picker@^9`, `date-fns@^3`
- `admin-frontend/src/App.tsx` — register `/dashboard/pickup-config` route
- `admin-frontend/src/components/layout/Sidebar.tsx` — insert nav entry
- `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx` (whatever the existing admin order detail path is) — display pickup method, location, and timestamp
- `admin-frontend/src/hooks/use-locale.ts` (or the admin i18n JSON) — add `pickupConfig.*` keys for the new page
- `shared/src/types/pickup.ts` — already created per `backend-api.md`; admin consumes the same types

## Step-by-Step Implementation

### Step 1: Install dependencies

```bash
cd admin-frontend
npm install react-day-picker@^9 date-fns@^3 @radix-ui/react-popover
```

Add the CJS/ESM interop block to `vite.config.ts` only if Vite warns about it during dev — `react-day-picker` is ESM and should work without extra config.

> `@radix-ui/react-popover` is **not** already a dep of `admin-frontend` (the installed Radix packages are dialog/label/select/slot/tabs only). It has to be added explicitly here, otherwise Step 2's `popover.tsx` import fails.

### Step 2: Popover + Calendar primitives (shadcn)

Mirror the customer-frontend implementations but under `admin-frontend/src/components/ui/`:

- `popover.tsx` — wrap `@radix-ui/react-popover`.
- `calendar.tsx` — wrap `react-day-picker` `DayPicker` with the admin's nova-preset classNames. Admin uses `--primary-500` as well (rewired from FEAT-5 palette), so the same classNames as the customer variant apply.

**Rationale:** Admin uses Radix directly (customer uses `@base-ui/react`) — keep each frontend in its own primitive lane. Don't try to share a single `ui/` module across the two apps; the existing code deliberately duplicates because Vite + Next import models differ.

### Step 3: `usePickupConfig` queries

**File:** `admin-frontend/src/queries/usePickupConfig.ts`

Mirror `useSiteContent.ts` line-for-line. The admin-frontend imperative fetcher is exported as `defaultFetchFn` from `@/lib/admin-fetchers` — there is no `adminFetch` helper, so import the same symbol that `useSiteContent` uses.

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { defaultFetchFn } from '@/lib/admin-fetchers';
import type {
  PickupSettingsResponse,
  PickupLocation,
  UpdatePickupSettingsRequest,
  CreatePickupLocationRequest,
  UpdatePickupLocationRequest,
} from '@repo/shared';

export function useAdminPickupSettings() {
  return useQuery<PickupSettingsResponse>({ queryKey: ['api', 'admin', 'pickup-settings'] });
}

export function useUpdatePickupSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdatePickupSettingsRequest) =>
      defaultFetchFn({ queryKey: ['api', 'admin', 'pickup-settings'] } as any, {
        method: 'PUT',
        body: JSON.stringify(dto),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api', 'admin', 'pickup-settings'] }),
  });
}

export function useAdminPickupLocations() {
  return useQuery<PickupLocation[]>({ queryKey: ['api', 'admin', 'pickup-locations'] });
}

export function useCreatePickupLocation() {
  /* POST ... via defaultFetchFn */
}
export function useUpdatePickupLocation() {
  /* PATCH ... via defaultFetchFn */
}
export function useDeletePickupLocation() {
  /* DELETE ... via defaultFetchFn */
}
```

**Rationale:** Mirrors the `useSiteContent.ts` pattern exactly — Bearer token picked up by the default `queryFn` via `adminFetchers.ts`. If the existing `useSiteContent` mutation uses a slightly different call shape (e.g. an imperative helper rather than reusing `defaultFetchFn`), copy that shape verbatim rather than introducing a new helper — the earlier draft of this plan referenced an `adminFetch` import that does not exist in the codebase.

### Step 4: `ScheduleSettings` form

**File:** `admin-frontend/src/routes/dashboard/pickup-config/ScheduleSettings.tsx`

Single `react-hook-form` form with these controls:

```tsx
const HOURS = ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
const WEEKDAYS = [
  { v: 1, label: '週一' },
  { v: 2, label: '週二' },
  { v: 3, label: '週三' },
  { v: 4, label: '週四' },
  { v: 5, label: '週五' },
  { v: 6, label: '週六' },
  { v: 0, label: '週日' },
];
```

Layout:

```tsx
<Card>
  <CardHeader>時段設定</CardHeader>
  <CardContent className="space-y-6">
    <fieldset>
      <legend>可預約時段 (15:00–22:00)</legend>
      <div className="grid grid-cols-4 gap-2">
        {HOURS.map((h) => (
          <Checkbox
            key={h}
            label={h}
            checked={values.timeSlots.includes(h)}
            onChange={(v) => toggle('timeSlots', h, v)}
          />
        ))}
      </div>
    </fieldset>

    <fieldset>
      <legend>固定休息日</legend>
      <div className="flex flex-wrap gap-3">
        {WEEKDAYS.map((d) => (
          <Checkbox
            key={d.v}
            label={d.label}
            checked={values.disabledWeekdays.includes(d.v)}
            onChange={(v) => toggle('disabledWeekdays', d.v, v)}
          />
        ))}
      </div>
    </fieldset>

    <fieldset>
      <legend>臨時休息區間</legend>
      <ClosureRangePicker
        startDate={values.closureStartDate}
        endDate={values.closureEndDate}
        onChange={({ start, end }) =>
          setValues({ ...values, closureStartDate: start, closureEndDate: end })
        }
      />
      <Button variant="ghost" onClick={clearClosure}>
        清除休息區間
      </Button>
    </fieldset>

    <fieldset>
      <legend>可預約天數 (X 天)</legend>
      <Input
        type="number"
        min={1}
        max={365}
        value={values.windowDays}
        onChange={(e) => setValues({ ...values, windowDays: Number(e.target.value) })}
      />
      <p className="text-xs text-[var(--fg-muted)]">後端預設為 30 天</p>
    </fieldset>

    <Button onClick={onSave}>儲存</Button>
  </CardContent>
</Card>
```

**Rationale:** Keeps everything in a single mutation payload (`PUT /api/admin/pickup-settings`). Weekday array uses JS `Date.getDay()` semantics (Sun=0) per the schema decision, but the label order starts on Monday to match Taiwanese calendar reading convention — only the display order differs, the stored integers match `Date.getDay()` exactly.

### Step 4 alt: `ClosureRangePicker`

**File:** `admin-frontend/src/routes/dashboard/pickup-config/ClosureRangePicker.tsx`

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">
      {startDate && endDate ? `${startDate} → ${endDate}` : '選擇休息區間'}
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <Calendar
      mode="range"
      selected={{ from: parseISO(startDate), to: parseISO(endDate) }}
      onSelect={(r) =>
        onChange({
          start: r?.from ? format(r.from, 'yyyy-MM-dd') : null,
          end: r?.to ? format(r.to, 'yyyy-MM-dd') : null,
        })
      }
    />
  </PopoverContent>
</Popover>
```

**Rationale:** `react-day-picker` has first-class `mode="range"` support; no extra component needed.

### Step 5: `LocationManager` component

**File:** `admin-frontend/src/routes/dashboard/pickup-config/LocationManager.tsx`

Table-driven with an **explicit per-row edit mode** rather than inline `onBlur`-patch:

```tsx
<Card>
  <CardHeader>
    地點管理
    <Dialog>
      <DialogTrigger>
        <Button>新增地點</Button>
      </DialogTrigger>
      <DialogContent>
        <LocationForm onSubmit={create} />
      </DialogContent>
    </Dialog>
  </CardHeader>
  <Table>
    <THead>中文名稱 / 英文名稱 / 啟用中 / 操作</THead>
    {locations.map((loc) => {
      const isEditing = editingId === loc.id;
      return (
        <Row key={loc.id}>
          <Cell>
            {isEditing ? <Input ref={zhRef} defaultValue={loc.label_zh} /> : loc.label_zh}
          </Cell>
          <Cell>
            {isEditing ? <Input ref={enRef} defaultValue={loc.label_en} /> : loc.label_en}
          </Cell>
          <Cell>
            <Switch
              checked={loc.is_active}
              onCheckedChange={(v) => patch(loc.id, { is_active: v })}
            />
          </Cell>
          <Cell>
            {isEditing ? (
              <>
                <Button
                  onClick={() => {
                    patch(loc.id, {
                      label_zh: zhRef.current!.value,
                      label_en: enRef.current!.value,
                    });
                    setEditingId(null);
                  }}
                >
                  儲存
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => setEditingId(loc.id)}>編輯</Button>
                <Button variant="destructive" onClick={() => confirmDelete(loc.id)}>
                  刪除
                </Button>
              </>
            )}
          </Cell>
        </Row>
      );
    })}
  </Table>
</Card>
```

**Rationale:** An earlier draft patched each field on `onBlur` — simple, but two quick edits on the same row fire two racing PATCH calls (and no optimistic state), and tabbing between two inputs sends an intermediate save. Explicit edit mode:

1. Groups both field changes into a single PATCH when the admin clicks **儲存**.
2. Makes the admin's intent explicit — avoids an "oops I refocused" accidental save.
3. Matches how `ContentEditor.tsx` already handles per-key edits.

The `is_active` switch can stay one-click — it's a boolean toggle, no racing keystrokes, and the defensive "last active location" guard lives in the backend (`PickupService.softDeleteLocation`) so the UI can surface that 400 as a toast rather than replicating the rule.

### Step 6: `PickupConfigPage` wrapper

**File:** `admin-frontend/src/routes/dashboard/pickup-config/PickupConfigPage.tsx`

```tsx
export function PickupConfigPage() {
  const { data: settings, isLoading: sLoading } = useAdminPickupSettings();
  const { data: locs, isLoading: lLoading } = useAdminPickupLocations();

  if (sLoading || lLoading) return <Skeleton />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">取貨設定</h2>
      <LocationManager locations={locs!} />
      <ScheduleSettings initial={settings!} />
    </div>
  );
}
```

### Step 7: Wire into routing + sidebar

**File:** `admin-frontend/src/App.tsx`

```tsx
<Route path="pickup-config" element={<PickupConfigPage />} />
```

**File:** `admin-frontend/src/components/layout/Sidebar.tsx`

Insert into the nav array (after Orders):

```ts
{ to: '/dashboard/pickup-config', icon: <CalendarIcon />, label: '取貨設定' },
```

**Rationale:** Top-level per A2. Place after Orders because pickup settings relate to order fulfillment.

### Step 8: Extend admin order detail + list

**Detail** — e.g. `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx`

Add a small "取貨資訊" section near the existing customer info card:

```tsx
<Card>
  <CardHeader>取貨資訊</CardHeader>
  <CardContent className="space-y-1">
    <Row label="方式">{order.pickup_method === 'in_person' ? '面交' : '7-11 冷凍取貨'}</Row>
    <Row label="地點">{order.pickup_location_label_zh}</Row>
    <Row label="時間">{format(parseISO(order.pickup_at), 'yyyy-MM-dd HH:mm')}</Row>
  </CardContent>
</Card>
```

**List** — the order list table gains a single "取貨時間" column rendering `pickup_at` as `MM-DD HH:mm`. The column is populated only if the backend `OrderAdminService.list()` SELECT also includes `pickup_method, pickup_at, pickup_location:pickup_locations(label_zh, label_en)` — see `backend-api.md` Step 9. Without the BE change the column is blank, which is the most common failure mode when retrofitting columns through a nested service.

**Rationale:** Per C8. The location label comes from the join added in the backend (`pickup_location_label_zh`).

### Step 9: Admin i18n keys (optional polish)

Admin is zh-only for v1 per the existing `use-locale.ts` hook, so hardcoded zh strings in the JSX above are acceptable. If preferred, extract to `admin-frontend/src/i18n/zh.json` under a new `pickupConfig.*` namespace — same convention as the customer FE.

## Testing Steps

1. **`ScheduleSettings.test.tsx`** (Vitest) — render with seed settings, click a checkbox, confirm the mutation payload shape matches `UpdatePickupSettingsRequest`.
2. **Manual**:
   - Log in as admin, navigate to `/dashboard/pickup-config`.
   - Add a location "新竹 - 測試點" → refresh customer cart → new location appears in dropdown.
   - Toggle a time-slot off → customer cart's time-slot radio hides it.
   - Set closure range to today..today+3 → customer calendar greys those dates.
   - Check `window_days` = 5 → customer calendar only offers next 5 days.
   - Open an existing order in admin → confirm pickup info renders (after backfill).
3. **Smoke**: `cd admin-frontend && npx vitest run` passes; `cd admin-frontend && npm run build` succeeds (types from `@repo/shared` resolve).

## Dependencies

- Depends on: `backend-api.md` (admin endpoints must exist).
- Independent of: `customer-frontend.md` — they consume the same backend but can ship in any order; the admin UI is usable as soon as the backend is live.

## Notes

- Don't forget to wrap `PickupConfigPage` with the existing `AdminAuthGuard` — adding it inside the `<Route>` is handled by the parent `/dashboard/*` guard per `admin-auth-guard.tsx`, so no per-route work unless this repo deviates.
- `Checkbox` and `Switch` already exist in `admin-frontend/src/components/ui/` per the exploration pass. No new shadcn generation beyond calendar + popover.
- If you refactor `orders` admin list later to use server-side filtering by pickup date, the `orders_pickup_at_idx` added in `database-schema.md` already supports it.
- The react-hook-form pattern in `ScheduleSettings` is simpler than a full form (only one submit button, all-or-nothing) — plain `useState` is fine and matches the existing `ContentEditor.tsx` style.
