# Implementation Plan: Admin Resend-LINE Confirm Dialog

## Overview

Wrap the admin "Resend LINE Message" button in a confirm dialog so a single misclick cannot immediately re-push a flex card to the customer. Reuses the existing shadcn `Dialog` pattern already used for delete-confirms (e.g., `HeroSlidesPanel.tsx`).

No backend changes. No rate limit. No DB changes.

## Files to Modify

### Frontend Changes

- `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx`
  - Add local `useState` for dialog open state.
  - Change the resend button's `onClick` from calling `handleResend` directly to opening the dialog.
  - Add a `Dialog` block (title, description, Cancel, Confirm) at the bottom of the component's JSX. The Confirm button calls the existing `handleResend` and closes the dialog.
  - Purpose: requires an explicit second click before the resend mutation fires, so that an accidental click does not spam the customer.

- `admin-frontend/src/i18n/zh.json`
  - Add `order.resendConfirmTitle`, `order.resendConfirmDesc`, and `order.cancel` (if not already present).
  - Purpose: copy for the dialog. zh-only is shipped today; en mirror added for symmetry with existing pattern.

- `admin-frontend/src/i18n/en.json`
  - Add the same three keys with English copy.

### Backend Changes

None.

### Shared Types

None.

## Step-by-Step Implementation

### Step 1: Add i18n keys

**File:** `admin-frontend/src/i18n/zh.json`

Inside the `order` object (next to existing keys like `resendLine`, `resending`, `resendSuccess`, `resendFailedNotFriend`, `resendFailedNoLine`):

```json
"resendConfirmTitle": "確認重送 LINE 訊息？",
"resendConfirmDesc": "客人會立刻在 LINE 收到一張和原本一樣的訂單卡片。確定要重送嗎？",
"cancel": "取消"
```

If `order.cancel` already exists, do not duplicate it.

**File:** `admin-frontend/src/i18n/en.json`

```json
"resendConfirmTitle": "Resend LINE message?",
"resendConfirmDesc": "The customer will immediately receive a duplicate of the original order card on LINE. Continue?",
"cancel": "Cancel"
```

**Rationale:** copy is the user-visible part of the safeguard; mirrors the existing zh+en pattern used elsewhere in the admin.

### Step 2: Add dialog state and imports

**File:** `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx`

**Changes:**

- Add the React `useState` import (already present? check — file currently has no React import; add `import { useState } from 'react';`).
- Add the dialog imports from the existing UI primitive:

```ts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
```

- Inside `OrderDetail`, after the existing hook calls (`useAdminOrder`, `useUpdateOrderStatus`, `useResendLine`):

```ts
const [resendConfirmOpen, setResendConfirmOpen] = useState(false);
```

**Rationale:** matches the local-state pattern used in `HeroSlidesPanel.tsx` (`deleteTarget` state controls dialog open).

### Step 3: Switch the button to open the dialog

**File:** `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx`

**Before (lines 93-102):**

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={handleResend}
  disabled={resend.isPending}
  className="self-start sm:self-auto"
>
  <Send className="mr-2 h-4 w-4" />
  {resend.isPending ? t('order.resending') : t('order.resendLine')}
</Button>
```

**After:**

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setResendConfirmOpen(true)}
  disabled={resend.isPending}
  className="self-start sm:self-auto"
>
  <Send className="mr-2 h-4 w-4" />
  {resend.isPending ? t('order.resending') : t('order.resendLine')}
</Button>
```

**Rationale:** delegates the actual mutation to the dialog's confirm action; the button becomes a "request confirmation" trigger.

### Step 4: Refactor `handleResend` to close the dialog on completion

**File:** `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx`

**Change:** in the existing `handleResend` function, close the dialog as the first line in both branches (success and error). Use a `try/finally` so the dialog closes even on error.

**After:**

```ts
async function handleResend() {
  try {
    await resend.mutateAsync();
    toast.success(t('order.resendSuccess'));
  } catch (err) {
    if (err instanceof ApiResponseError && err.status === 409) {
      const body = err.body as { reason?: string };
      if (body?.reason === 'not_friend') {
        toast.error(t('order.resendFailedNotFriend'));
      } else {
        toast.error(t('order.resendFailedNoLine'));
      }
    } else {
      toast.error(t('common.error'));
    }
  } finally {
    setResendConfirmOpen(false);
  }
}
```

**Rationale:** the dialog must close after the mutation resolves regardless of outcome; the existing toast logic already conveys success/error.

### Step 5: Render the dialog

**File:** `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx`

Add the dialog as the last sibling inside the component's returned root `<div>` (mirrors `HeroSlidesPanel.tsx:241-265`):

```tsx
<Dialog open={resendConfirmOpen} onOpenChange={setResendConfirmOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t('order.resendConfirmTitle')}</DialogTitle>
      <DialogDescription>{t('order.resendConfirmDesc')}</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setResendConfirmOpen(false)}
        disabled={resend.isPending}
      >
        {t('order.cancel')}
      </Button>
      <Button
        onClick={handleResend}
        disabled={resend.isPending}
        data-testid="btn-confirm-resend-line"
      >
        {resend.isPending ? t('order.resending') : t('order.resendLine')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Rationale:**

- `onOpenChange` lets the user close the dialog by clicking the backdrop or hitting Esc.
- Disabling Cancel while `resend.isPending` is intentional — once the mutation is in flight we don't want the dialog state to drift; the `finally` in step 4 closes it.
- `data-testid` follows the existing convention (`btn-confirm-delete-hero` etc.) for future Playwright/RTL tests.

## Testing Steps

1. `cd admin-frontend && npm run lint` — no regressions.
2. `cd admin-frontend && npm run build` — TypeScript and Vite build pass.
3. `cd admin-frontend && npm run dev` then manually:
   - Log in as an admin/owner; open an order detail page that has a `line_user_id`.
   - Click "Resend LINE Message" → dialog appears with the new title and description.
   - Click Cancel → dialog closes; no LINE message sent (verify by checking that `orders.updated_at` is unchanged).
   - Click the confirm button → dialog closes; success toast appears; the customer (or the test LINE account) receives a duplicate flex card; `orders.updated_at` is bumped.
   - Repeat with a non-LINE order to confirm the existing `not_friend` / `resendFailedNoLine` error toasts still work.
4. Keyboard accessibility check: hit Esc on the open dialog → dialog closes without firing the mutation.

## Dependencies

- Independent of the backend `line-send` removal (`backend-line-send-removal.md`); ship together or separately.

## Notes

- No server-side cooldown is added (per product direction). If misclicks recur after this change, revisit and consider a 60s server-side cooldown plus an audit row.
- Reusing `Dialog` (already in `components/ui/dialog.tsx`) avoids pulling in shadcn's `AlertDialog` primitive, which is not currently installed and would otherwise need `npx shadcn@latest add alert-dialog`.
- The `handleResend` change moves the close logic into a `finally` so the dialog never gets stuck open; this is the only behavioral change to the existing happy path.
