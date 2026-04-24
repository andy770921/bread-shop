# Implementation Plan: Customer Frontend

## Overview

Adds a **Pickup** block to `/cart` with three inputs: method dropdown, location dropdown, and a date+time picker (date from a calendar popover, time as a radio group of admin-configured slots). All three are required before the place-order button enables. The place-order button also disables when payment method is `credit_card` (gated for a future ticket).

Uses **react-day-picker v9 + date-fns v3** for the calendar, with the popover built on the already-installed `@base-ui/react` Popover primitive. New customer-facing strings ship in `i18n/zh.json` + `en.json` so they flow automatically through the existing site-content admin editor.

## Files to Modify

### New files

- `frontend/src/features/pickup/PickupSection.tsx` — the whole cart block
- `frontend/src/features/pickup/PickupDatePicker.tsx` — popover + calendar
- `frontend/src/features/pickup/PickupTimeSlotRadio.tsx` — time-slot radio group
- `frontend/src/features/pickup/use-pickup-settings.ts` — TanStack hook
- `frontend/src/features/pickup/pickup-schema.ts` — Zod fragment + helpers
- `frontend/src/components/ui/calendar.tsx` — shadcn Calendar wrapper over react-day-picker
- `frontend/src/components/ui/popover.tsx` — wrapper over `@base-ui/react` Popover
- `frontend/src/features/pickup/__tests__/PickupDatePicker.test.tsx`

### Modified files

- `frontend/package.json` — add `react-day-picker@^9`, `date-fns@^3`
- `frontend/src/features/checkout/cart-form.ts` — extend Zod schema with pickup fields, update the payment-method enum guard
- `frontend/src/features/checkout/use-checkout-flow.ts` — include pickup fields in the submit payload
- `frontend/src/app/cart/page.tsx` — mount `<PickupSection />` and wire the disable condition on the submit button
- `frontend/src/i18n/zh.json` + `en.json` — add `cart.pickup.*` keys
- `frontend/src/queries/orderService.ts` (or wherever `createOrder` is defined) — pass new fields through; surface the 400 `code:'pickup_slot_unavailable'` as a translated toast
- `frontend/src/globals.css` — optional: CSS-variable hooks for calendar accent if needed

## Step-by-Step Implementation

### Step 1: Install calendar packages

```bash
cd frontend
npm install react-day-picker@^9 date-fns@^3
```

**Rationale:** Locked to v9 + v3 because v9 requires date-fns v3+. Both are pure-ESM and Tailwind-friendly.

### Step 2: shadcn primitives

**File:** `frontend/src/components/ui/popover.tsx`

Thin wrapper exporting `Popover`, `PopoverTrigger`, `PopoverContent` from `@base-ui/react/popover`, with Tailwind styling matching the existing `components/ui/sheet.tsx` token palette (shadow, border, `bg-[var(--bg-card)]`).

**File:** `frontend/src/components/ui/calendar.tsx`

Wrap `DayPicker` from `react-day-picker` and apply the shadcn "nova" classNames map. Key classNames to override for brand match:

```ts
classNames: {
  months: 'flex flex-col sm:flex-row gap-4',
  caption_label: 'text-sm font-medium',
  day_button: cn('h-9 w-9 rounded-md text-sm hover:bg-[var(--primary-100)]',
                 'aria-selected:bg-[var(--primary-500)] aria-selected:text-white',
                 'disabled:opacity-30 disabled:pointer-events-none'),
  today: 'text-[var(--primary-500)] font-semibold',
  outside: 'text-[var(--fg-subtle)] opacity-50',
}
```

**Rationale:** Re-uses the same `--primary-500` / `--bg-body` CSS variables documented in `globals.css` so dark mode comes for free.

### Step 3: `usePickupSettings`

**File:** `frontend/src/features/pickup/use-pickup-settings.ts`

```ts
export function usePickupSettings() {
  return useQuery<PickupSettingsResponse>({ queryKey: ['api', 'pickup-settings'] });
}
```

**Rationale:** Leverages the shared default `queryFn` (`stringifyQueryKey` → `/api/pickup-settings`). No custom fetcher needed. 60s staleTime from the provider default is appropriate — admin edits aren't frequent.

### Step 4: Zod schema fragment

**File:** `frontend/src/features/pickup/pickup-schema.ts`

```ts
import { z } from 'zod';

export const pickupSchema = z
  .object({
    method: z.enum(['in_person', 'seven_eleven_frozen']),
    locationId: z.string().uuid().optional(),
    date: z.date().optional(),
    timeSlot: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.method !== 'in_person') {
      ctx.addIssue({ path: ['method'], code: 'custom', message: 'pickup_method_unavailable' });
      return;
    }
    if (!val.locationId)
      ctx.addIssue({ path: ['locationId'], code: 'custom', message: 'required' });
    if (!val.date) ctx.addIssue({ path: ['date'], code: 'custom', message: 'required' });
    if (!val.timeSlot) ctx.addIssue({ path: ['timeSlot'], code: 'custom', message: 'required' });
  });

export function composePickupAt(date: Date, timeSlot: string): string {
  const [h, m] = timeSlot.split(':');
  // Build local wall-clock time in Taipei then serialize with +08:00 offset.
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${h}:${m}:00+08:00`;
}

export type PickupValues = z.infer<typeof pickupSchema>;
```

**Rationale:** The refinement makes 7-11 **itself** invalidate the form, so `formState.isValid` is false whenever method is `seven_eleven_frozen`. An earlier draft only required the location/date/time fields when method was in-person and relied on a separate JSX-level check to block the submit button — that works for button disabling but still allows a form submit if someone hits Enter on an input, so we promote the rule into Zod where react-hook-form's `handleSubmit` honors it uniformly.

### Step 5: Extend cart form schema

**File:** `frontend/src/features/checkout/cart-form.ts`

```ts
import { pickupSchema } from '@/features/pickup/pickup-schema';

export const cartFormSchema = z.object({
  // ...existing fields...
  pickup: pickupSchema,
});
```

Default values:

```ts
pickup: { method: 'in_person', locationId: undefined, date: undefined, timeSlot: undefined }
```

### Step 6: `PickupSection` component

**File:** `frontend/src/features/pickup/PickupSection.tsx`

Structure (using `react-hook-form`'s `<FormField>` pattern already used in `cart-form.ts`):

```tsx
export function PickupSection() {
  const form = useFormContext<CartFormValues>();
  const { data, isLoading } = usePickupSettings();
  const method = form.watch('pickup.method');

  if (isLoading || !data) return <Skeleton className="h-64" />;

  return (
    <section className="rounded-lg border p-4 space-y-4">
      <h3 className="text-base font-semibold">{t('cart.pickup.title')}</h3>

      <FormField
        control={form.control}
        name="pickup.method"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in_person">{t('cart.pickup.method.inPerson')}</SelectItem>
              <SelectItem value="seven_eleven_frozen">{t('cart.pickup.method.sevenEleven')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      />

      {method === 'seven_eleven_frozen' && (
        <p className="text-sm text-[var(--fg-muted)]">{t('cart.pickup.method.sevenElevenNotice')}</p>
      )}

      {method === 'in_person' && (
        <>
          <FormField name="pickup.locationId" …>  {/* Select of data.locations, label = current locale */}
          <PickupDatePicker settings={data} />
          <PickupTimeSlotRadio slots={data.timeSlots} />
        </>
      )}
    </section>
  );
}
```

**Rationale:**

- The dropdown for 7-11 stays enabled (it's just informational), but the submit button elsewhere disables — this keeps the UI honest about the option existing.
- `PickupDatePicker` receives the whole settings object so its `disabled` matcher can compose without prop-drilling.

### Step 7: `PickupDatePicker`

**File:** `frontend/src/features/pickup/PickupDatePicker.tsx`

```tsx
import { DayPicker } from 'react-day-picker';
import { addDays, parseISO } from 'date-fns';

export function PickupDatePicker({ settings }: { settings: PickupSettingsResponse }) {
  const form = useFormContext<CartFormValues>();
  const date = form.watch('pickup.date');

  const today = startOfDayTaipei(new Date());
  const earliest = addDays(today, settings.leadDays ?? 0);
  const end = addDays(today, settings.windowDays);
  const closureStart = settings.closureStartDate ? parseISO(settings.closureStartDate) : null;
  const closureEnd = settings.closureEndDate ? parseISO(settings.closureEndDate) : null;

  const disabled = [
    { before: earliest },
    { after: end },
    (d: Date) => settings.disabledWeekdays.includes(d.getDay()),
    ...(closureStart && closureEnd ? [{ from: closureStart, to: closureEnd }] : []),
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          {date ? format(date, 'yyyy-MM-dd') : t('cart.pickup.date.placeholder')}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => form.setValue('pickup.date', d, { shouldValidate: true })}
          disabled={disabled}
          startMonth={today}
          endMonth={end}
        />
      </PopoverContent>
    </Popover>
  );
}
```

**Rationale:** Composing `disabled` as an array of matchers is react-day-picker's idiomatic pattern — no need to write a single mega-predicate. `startMonth` / `endMonth` cap the month navigation; these props replaced the legacy `fromDate` / `toDate` in react-day-picker v9. The per-day bound is enforced by the `{ before: earliest }` / `{ after: end }` matchers inside `disabled`, not by the navigation props, so don't also pass `fromDate`/`toDate` — they were removed in v9 and will either error or silently no-op. The `earliest` date is `today + leadDays` (default 2), which means customers cannot book today or tomorrow — this gives the shop owner preparation time.

### Step 8: `PickupTimeSlotRadio`

**File:** `frontend/src/features/pickup/PickupTimeSlotRadio.tsx`

Simple segmented radio group (no new primitive needed — use buttons with `aria-pressed`):

```tsx
export function PickupTimeSlotRadio({ slots }: { slots: string[] }) {
  const form = useFormContext<CartFormValues>();
  const selected = form.watch('pickup.timeSlot');

  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {slots.map((slot) => (
        <button
          key={slot}
          type="button"
          role="radio"
          aria-checked={selected === slot}
          onClick={() => form.setValue('pickup.timeSlot', slot, { shouldValidate: true })}
          className={cn(
            'px-4 py-2 rounded-md border text-sm',
            selected === slot ? 'bg-[var(--primary-500)] text-white' : 'bg-[var(--bg-card)]',
          )}
        >
          {slot}
        </button>
      ))}
    </div>
  );
}
```

### Step 9: Submit payload + button disable logic

**File:** `frontend/src/features/checkout/use-checkout-flow.ts`

In the `mutationFn`:

```ts
const { pickup, ...rest } = values;
const body = {
  ...rest,
  pickup_method: pickup.method,
  pickup_location_id: pickup.locationId,
  pickup_at: composePickupAt(pickup.date!, pickup.timeSlot!),
};
return orderService.createOrder(body);
```

Catch block — on `ApiResponseError` with `status === 400` and `body.code === 'pickup_slot_unavailable'`:

```ts
toast.error(t('cart.pickup.errors.slotUnavailable'));
queryClient.invalidateQueries({ queryKey: ['api', 'pickup-settings'] });
```

**File:** `frontend/src/app/cart/page.tsx`

Disable the place-order button when **any** of:

```ts
const { isSubmitting, formState, watch } = form;
const method = watch('pickup.method');
const paymentMethod = watch('paymentMethod');

const disabled =
  isSubmitting ||
  !formState.isValid ||
  method === 'seven_eleven_frozen' ||
  paymentMethod === 'credit_card'; // NEW per user feedback
```

**Rationale:** The user explicitly added credit-card to the disabled list ("順便幫我注意..."); it's tracked here rather than hidden behind a flag so the reviewer sees it.

### Step 10: i18n keys

**File:** `frontend/src/i18n/zh.json` (add under existing structure)

```json
"cart": {
  "pickup": {
    "title": "取貨方式",
    "method": {
      "label": "取貨方式",
      "inPerson": "面交",
      "sevenEleven": "7-11 冷凍取貨",
      "sevenElevenNotice": "此方案正在擴展中"
    },
    "location": { "label": "面交地點", "placeholder": "請選擇地點" },
    "date":     { "label": "面交日期", "placeholder": "請選擇日期" },
    "timeSlot": { "label": "面交時間" },
    "errors":   { "slotUnavailable": "此時段已無法預約，請重新選擇" }
  }
}
```

**File:** `frontend/src/i18n/en.json` — mirror with English translations.

**Rationale:** Because the existing admin content editor reads `@frontend-i18n/{zh,en}.json` via `lib/content-keys.ts`, these keys show up in the editor with zero extra wiring. Admin can then override per-deploy via `/api/admin/site-content`.

## Testing Steps

1. **`PickupDatePicker.test.tsx`** — render with mocked settings where `disabledWeekdays=[0]` and a closure range; click-through and assert the `aria-disabled="true"` state on excluded dates.
2. **Existing spec fallout** — any pre-existing Jest test that constructs a `cartFormSchema` payload (grep `cartFormSchema`, `use-checkout-flow`, `createOrder`) must be updated to include valid pickup defaults, otherwise they start failing the moment Step 5 lands. The same applies to the backend `order.service.spec.ts` fixtures when the `create-order.dto.ts` extension ships.
3. **Jest + react-day-picker ESM** — react-day-picker v9 and date-fns v3 ship as pure ESM. Jest's default transform ignores `node_modules`, so if `PickupDatePicker.test.tsx` fails with `SyntaxError: Unexpected token 'export'`, update `frontend/jest.config.ts` so those two packages are transformed, e.g. `transformIgnorePatterns: ['/node_modules/(?!(react-day-picker|date-fns)/)']`.
4. **Manual** — `npm run dev`, open `/cart` with items in cart:
   - Switch method to 7-11 → notice appears, submit disabled.
   - Switch method to 面交 → location + date + time appear, submit still disabled until all three set.
   - Pick a date — confirm calendar greys out today's past hours, beyond-30-day dates, Sundays (if admin toggled), closure range.
   - Submit with valid pickup → order created, cart clears.
5. **Race test** — place an item in cart, select a date, then in the admin FE add that date to the closure window, return to customer cart, press submit → expect toast "此時段已無法預約". Query cache invalidation means the next open of the date picker shows the new disabled state.
6. **Credit card gate** — switch payment method to credit card → submit button disables regardless of pickup state.
7. **Rewrite check (one-time)** — before hitting `/api/pickup-settings` from the browser, confirm `frontend/next.config.ts` rewrites with a wildcard path such as `/api/:path*` rather than enumerating individual endpoints. Papa Bakery already uses a wildcard, so the new endpoint should Just Work; this is only a pre-flight sanity check.

## Dependencies

- Depends on: `backend-api.md` (needs `GET /api/pickup-settings` live) and `database-schema.md` transitively.
- Independent of: `admin-frontend.md`.

## Notes

- Do not add `react-day-picker` to `admin-frontend` unless a later ticket adds admin-side date UI. The closure-range picker on the admin settings page needs it — see `admin-frontend.md` Step 4.
- The Taipei-offset ISO string is built by hand (`...T15:00:00+08:00`) rather than via `date-fns-tz` to avoid a second tz lib. `composePickupAt` is unit-test-covered by the pickup validator's matching logic on the backend.
- `Select` / `SelectTrigger` / `SelectContent` must exist in `frontend/src/components/ui/` already (confirmed in the exploration pass). No new shadcn generation needed except `calendar` + `popover`.
- Keep `PickupSection` fully driven by `FormContext` — do not pass callbacks up. This is consistent with the existing `cart-form.ts` shape.
- **Pickup does not prefill from the draft store.** The existing `checkout_contact_drafts` table / `CartContactDraftService` persists `customer_name`, `customer_phone`, etc. across cart visits. Pickup fields (method, location, date, slot) are intentionally **not** added to the draft — the settings they validate against (time slots, blackouts, closures) can change between visits, so a stale pickup draft would likely be invalid on the next page load. Starting blank is clearer for the user. If a future ticket wants to prefill pickup, route through a 'validate draft against current settings' step before showing it.
