# Implementation Plan: Frontend UI — Payment Info Section

## Overview

Replace the dual-CTA buttons in the Order Summary sidebar with a new "付款資訊" section in the left column. The section uses `react-hook-form` + `zod` for form validation, a native `<select>` for the payment method dropdown, conditional credit card / LINE fields, and a single CTA button. When "LINE 聯繫，銀行轉帳" is selected, the UI adapts based on whether the user is logged in via LINE — showing either a green "linked" notice or a LINE login prompt.

## Files Modified

### New Dependencies (frontend)

- `react-hook-form` — form state management and validation
- `@hookform/resolvers` — zod resolver bridge for react-hook-form
- `zod` (v3.25.x) — schema-based validation (must use v3, NOT v4 — see Notes)

### New Files

- `frontend/src/components/ui/form.tsx`
  - shadcn-compatible Form component wrapping react-hook-form's `FormProvider` + `Controller`
  - Provides: `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`

### Modified Files

- `frontend/src/app/cart/page.tsx` — Full rewrite (see below)
- `frontend/src/app/auth/callback/page.tsx` — Return URL support (see `send-line-to-user.md`)
- `frontend/src/i18n/zh.json` — 17 new keys under `"cart"`
- `frontend/src/i18n/en.json` — 17 new keys under `"cart"`

## Step-by-Step Implementation

### Step 1: Install Dependencies

```bash
cd frontend && npm install react-hook-form @hookform/resolvers zod@3.25.76
```

**Rationale:** Zod v4.x has internal type version mismatches with `@hookform/resolvers` v5 (`_zod.version.minor` incompatibility). Must use zod v3.25.x which aligns with the root workspace's existing zod version.

---

### Step 2: Create shadcn Form Component

**File:** `frontend/src/components/ui/form.tsx`

**Changes:** Create a new file exporting `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`. These wrap react-hook-form's `FormProvider` and `Controller` with context-based error display. No dependency on `@radix-ui` or `@base-ui` — purely react-hook-form context + styling.

---

### Step 3: Add i18n Translation Keys

**File:** `frontend/src/i18n/zh.json` and `frontend/src/i18n/en.json`

**Changes:** Add 17 new keys under the `"cart"` object:

| Key | zh | en |
|-----|----|----|
| `paymentInfo` | 付款資訊 | Payment Info |
| `paymentMethod` | 付款方式 | Payment Method |
| `paymentMethodPlaceholder` | 請選擇付款方式 | Select payment method |
| `paymentCreditCard` | 信用卡 | Credit Card |
| `paymentLineTransfer` | LINE 聯繫，銀行轉帳 | LINE Contact, Bank Transfer |
| `cardNumber` | 信用卡號 | Card Number |
| `cardNumberPlaceholder` | 0000 0000 0000 0000 | 0000 0000 0000 0000 |
| `cardExpiry` | 到期日 | Expiry Date |
| `cardExpiryPlaceholder` | MM/YY | MM/YY |
| `cardCvv` | 安全碼 | CVV |
| `cardCvvPlaceholder` | CVV | CVV |
| `cardholderName` | 持卡人姓名 | Cardholder Name |
| `cardholderNamePlaceholder` | 持卡人姓名 | Cardholder Name |
| `lineId` | 訂購人 LINE ID | Your LINE ID |
| `lineIdPlaceholder` | 請輸入您的 LINE ID | Enter your LINE ID |
| `lineLinked` | 已連結 LINE 帳號，訂單確認將自動傳送至您的 LINE | LINE account linked. Order confirmation will be sent to your LINE automatically. |
| `lineLoginPrompt` | 使用 LINE 登入後，我們可以透過 LINE 自動傳送訂單確認給您 | Log in with LINE so we can send order confirmation to you via LINE. |
| `lineLoginBtn` | 使用 LINE 登入 | Login with LINE |
| `lineIdOptional` | LINE ID（選填，供店家參考） | LINE ID (optional, for shop reference) |
| `required` | 此欄位為必填 | This field is required |

---

### Step 4: Rewrite Cart Page with react-hook-form

**File:** `frontend/src/app/cart/page.tsx`

#### 4a. New Imports

```typescript
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/lib/auth-context';
```

Removed imports: `useState` (no longer needed for form state), `Label` (replaced by `FormLabel`), shadcn `Select` components.

#### 4b. Zod Schema

Define outside the component:

```typescript
const paymentMethods = ['credit_card', 'line_transfer'] as const;

const cartFormSchema = z.object({
  customerName: z.string().min(1, 'required'),
  customerPhone: z.string().min(1, 'required'),
  customerEmail: z.string().email().or(z.literal('')).optional(),
  customerAddress: z.string().min(1, 'required'),
  notes: z.string().optional(),
  paymentMethod: z.enum(paymentMethods, { required_error: 'required' }),
  cardNumber: z.string().optional(),
  cardExpiry: z.string().optional(),
  cardCvv: z.string().optional(),
  cardholderName: z.string().optional(),
  lineId: z.string().optional(),
}).superRefine((data, ctx) => {
  // Credit card fields required when credit_card selected
  if (data.paymentMethod === 'credit_card') {
    if (!data.cardNumber) addRequired(ctx, 'cardNumber');
    if (!data.cardExpiry) addRequired(ctx, 'cardExpiry');
    if (!data.cardCvv) addRequired(ctx, 'cardCvv');
    if (!data.cardholderName) addRequired(ctx, 'cardholderName');
  }
  // lineId is always optional — CTA handles LINE Login redirect when not logged in
});
```

**Why lineId is not validated in zod:** LINE ID is always optional in the schema. When the user is not logged in via LINE, clicking the CTA triggers LINE Login (which obtains the internal userId). The LINE ID field is purely for admin reference — it is never a blocking requirement.

#### 4c. useForm Setup

```typescript
const { user } = useAuth();
const form = useForm<CartFormValues>({
  resolver: zodResolver(cartFormSchema),
  mode: 'onChange',  // real-time validation for formState.isValid
  defaultValues: { customerName: '', customerPhone: '', ... },
});
const selectedPayment = form.watch('paymentMethod');
```

#### 4d. Form Data Persistence Across LINE Login

When the CTA triggers LINE Login (redirect away + return), all form data would be lost. To solve this, form data is saved to localStorage before the redirect and restored on mount:

```typescript
// Restore form data after LINE Login redirect
useEffect(() => {
  const saved = localStorage.getItem('cart_form_data');
  if (saved) {
    localStorage.removeItem('cart_form_data');
    try {
      form.reset(JSON.parse(saved));
    } catch {}
  }
}, [form]);
```

#### 4e. Conditional Field Reset

```typescript
useEffect(() => {
  if (selectedPayment === 'credit_card') {
    form.setValue('lineId', '');
    form.clearErrors('lineId');
  } else if (selectedPayment === 'line_transfer') {
    form.setValue('cardNumber', '');
    // ... clear all CC fields
  }
}, [selectedPayment, form]);
```

#### 4f. CTA Disabled Logic

```typescript
const hasLineUserId = !!user?.line_user_id;

// CTA disabled uses form.formState.isValid directly — no extra LINE ID check
// because the CTA handles LINE Login redirect when not logged in
disabled={!form.formState.isValid || submitting}
```

This means:
- **Credit card:** disabled until all 4 CC fields + customer info filled (via zod isValid)
- **LINE transfer:** disabled until customer info filled (LINE ID is always optional in zod). When clicked, if user is not logged in via LINE, the CTA redirects to LINE Login instead of submitting the order.
```

#### 4g. Form Submit Handler

The `onSubmit` handler is dual-purpose for the LINE transfer flow — it either redirects to LINE Login or submits the order:

```typescript
const onSubmit = async (values: CartFormValues) => {
  const isLine = values.paymentMethod === 'line_transfer';
  const apiPaymentMethod = isLine ? 'line' : 'lemon_squeezy';

  // LINE transfer without LINE Login → save form data & redirect to LINE OAuth
  if (isLine && !hasLineUserId) {
    localStorage.setItem('cart_form_data', JSON.stringify(values));
    localStorage.setItem('line_login_return_url', '/cart');
    window.location.href = '/api/auth/line';
    return;
  }

  // Proceed with order creation...
  const orderData = await createOrder.mutateAsync({
    customer_name: values.customerName,
    // ...
    customer_line_id: isLine ? values.lineId : undefined,
    skip_cart_clear: isLine,
  });
  // ... rest of checkout flow (LINE send / Lemon Squeezy redirect)
};
```

**Key behavior:** When the user clicks "透過 LINE 聯繫" and is not logged in via LINE, the form validates first (all customer info must be filled), then saves all form values to `localStorage('cart_form_data')` and redirects to LINE OAuth. On return, the form is auto-restored (see Step 4d) and the user can click the CTA again to submit the order.

#### 4h. Payment Info Section JSX

The "付款資訊" section contains:

1. **Payment method dropdown** — native `<select>` element wrapped in `FormField`/`FormControl`
2. **Credit card fields** (when `credit_card` selected) — 4 `FormField` inputs in a 2-column grid
3. **LINE transfer section** (when `line_transfer` selected):
   - If `hasLineUserId`: green notice with `CheckCircle2` icon: "已連結 LINE 帳號..."
   - LINE ID input field (label shows `(選填)` when linked, plain label when not — always optional in zod)
4. **CTA button** — `type="submit"`, disabled by `!form.formState.isValid || submitting`
   - For credit card: gradient style
   - For LINE transfer: LINE green outline style, with hint text below when not logged in: "點擊後將先進行 LINE 登入，以便自動傳送訂單確認"

**UI simplification (v2):** The separate "使用 LINE 登入" prompt box was removed. The CTA "透過 LINE 聯繫" handles LINE Login directly when needed — form data is saved to localStorage before the redirect and restored on return. This eliminates the visual redundancy of having both a login button and a submit button.

#### 4i. Order Summary Sidebar

Removed the two CTA buttons. The sidebar is now display-only: line items, subtotal, shipping, total.

---

### Step 5: Form Wrapping Structure

```tsx
<div className="flex-1 space-y-6">
  {/* Cart Items (outside form) */}
  <div>...</div>

  {/* Form wraps customer info + payment info */}
  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Customer Info Section */}
      <div className="rounded-xl border p-6">...</div>
      {/* Payment Info Section */}
      <div className="rounded-xl border p-6">...</div>
    </form>
  </Form>

  {/* Continue Shopping (outside form) */}
  <Link href="/">...</Link>
</div>
```

---

## Testing Steps

1. **No payment method selected**: No CTA button visible, no conditional fields
2. **Select "信用卡"**: 4 CC fields appear, CTA disabled until all filled + customer info
3. **Select "LINE 聯繫，銀行轉帳" (not logged in)**: LINE ID field + disabled CTA + hint text "點擊後將先進行 LINE 登入..."
4. **Fill customer info**: CTA enables (LINE ID is optional)
5. **Click "透過 LINE 聯繫" (not logged in)**: Form validates → saves form data to localStorage → redirects to LINE OAuth
6. **After LINE login return**: Form auto-restored from localStorage, green "已連結 LINE" notice appears, hint text gone, LINE ID label changes to "(選填)"
7. **Click "透過 LINE 聯繫" (logged in)**: Submits order → sends to admin + customer via LINE → redirects to success
8. **Switch payment methods**: Previous method's fields cleared
9. **Credit card submit**: Triggers Lemon Squeezy flow (redirect to external checkout)
10. **Order Summary sidebar**: No CTA buttons, display-only
11. **Mobile responsive**: All sections stack correctly
12. **i18n**: Toggle locale → all labels switch

## Notes

- **Payment method dropdown uses native `<select>`**, not the shadcn Select component. The base-ui `@base-ui/react/select` has a Portal rendering bug where `SelectValue` displays the raw value string (e.g., "credit_card") instead of the label text when the popup is unmounted. Native `<select>` works reliably with react-hook-form.
- **Zod must be v3.25.x**, NOT v4. `@hookform/resolvers` v5 imports from `zod/v4/core` internally, and zod v4.3.x has `_zod.version.minor = 3` while the resolver expects `0`. This causes a TypeScript type mismatch at build time.
- **LINE ID is always optional** in the zod schema. The CTA handles LINE Login redirect when the user is not logged in via LINE — no need to make LINE ID a blocking requirement. The LINE ID field is for admin reference only.
- **Form data persistence across LINE Login:** Before redirecting to LINE OAuth, all form values are serialized to `localStorage('cart_form_data')`. On mount, the form checks for this key and restores the data via `form.reset()`. This ensures the user doesn't have to re-fill customer info after LINE Login.
- **Dual-purpose CTA:** The "透過 LINE 聯繫" button serves as both a LINE Login trigger (when not logged in) and an order submit button (when logged in). The hint text "點擊後將先進行 LINE 登入..." is shown only when not logged in to set user expectations.
- Credit card field values are **not sent to the backend** — they are purely UI. On submit, the existing Lemon Squeezy redirect flow is used.
- The `customer_line_id` field **is sent to the backend** when LINE transfer is selected (see `send-line-to-user.md`).
