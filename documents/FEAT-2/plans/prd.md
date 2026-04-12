# PRD: Cart Page Payment Info Section & Conditional CTA

## Problem Statement

On the `/cart` page, both CTA buttons ("信用卡付款" and "透過 LINE 聯繫") are always visible simultaneously. Users see two payment options with no clear flow for either. This creates confusion — users may click one without understanding the implications, and there is no mechanism to collect payment-method-specific info (credit card details, LINE ID) before checkout.

## Solution Overview

Replace the dual-CTA in the Order Summary sidebar with a new **"付款資訊" (Payment Info)** section in the left column, placed directly below the existing "訂購資訊" form. This section contains:

1. A **"付款方式" (Payment Method)** dropdown with two options
2. **Conditional form fields** that appear based on the selected method
3. A **single CTA button** matching the chosen payment method
4. **CTA disabled state** when any required field is empty

The credit card form fields are purely UI — on submit, the existing Lemon Squeezy redirect flow is preserved. The LINE ID field **is** sent to the backend and stored in the order for admin reference (see LINE API section below).

## User Stories

1. As a customer, I want to select my payment method before checkout so that I only see relevant fields and one clear action button.
2. As a customer choosing credit card, I want to fill in my card details so that the checkout flow feels complete before I'm redirected to the payment processor.
3. As a customer choosing LINE bank transfer, I want to provide my LINE ID so the shop can contact me about the transfer.
4. As a customer, I want the checkout button to be disabled until I've filled all required fields so that I don't submit incomplete information.

## Implementation Decisions

### Layout Change

- **New section**: "付款資訊" in the left column, between "訂購資訊" and "繼續購物" link
- **Remove**: Both CTA buttons from the right-column Order Summary sidebar
- The Order Summary sidebar becomes display-only (items, totals)

### Payment Method Dropdown

| Option Label             | Internal Value     | Conditional Fields                                      |
| ------------------------ | ------------------ | ------------------------------------------------------- |
| 信用卡                   | `credit_card`      | Card number, Expiry (MM/YY), CVV, Cardholder name       |
| LINE 聯繫，銀行轉帳       | `line_transfer`    | LINE ID                                                 |

Default: no selection (placeholder prompts user to choose).

### Credit Card Fields (when `credit_card` selected)

| Field           | Label (zh)     | Label (en)          | Required | Validation               |
| --------------- | -------------- | ------------------- | -------- | ------------------------ |
| Card number     | 信用卡號       | Card Number         | Yes      | 16 digits, formatted     |
| Expiry          | 到期日         | Expiry Date         | Yes      | MM/YY format             |
| CVV             | 安全碼         | CVV                 | Yes      | 3-4 digits               |
| Cardholder name | 持卡人姓名     | Cardholder Name     | Yes      | Non-empty string         |

These fields are **UI-only** — values are not sent to the backend. On submit, the existing Lemon Squeezy checkout redirect flow is used.

### LINE Transfer Fields (when `line_transfer` selected)

| Field   | Label (zh)      | Label (en)        | Required | Validation       |
| ------- | --------------- | ----------------- | -------- | ---------------- |
| LINE ID | 訂購人 LINE ID  | Your LINE ID      | Yes      | Non-empty string |

LINE ID is sent to the backend and stored in the `orders.customer_line_id` column. It is included in the admin LINE flex message so the admin can manually contact the customer on LINE. See the LINE API Feasibility section below for details.

### CTA Button Behavior

| Payment Method    | Button Text       | Button Style                        | Action on Click                    |
| ----------------- | ----------------- | ----------------------------------- | ---------------------------------- |
| `credit_card`     | 信用卡付款        | Gradient fill (existing style)      | `handleCheckout('lemon_squeezy')`  |
| `line_transfer`   | 透過 LINE 聯繫    | LINE green outline (existing style) | `handleCheckout('line')`           |
| (none selected)   | —                 | No button shown                     | —                                  |

### CTA Disabled Logic

The CTA button is **disabled** when ANY of these are true:
- `submitting` is true (existing)
- Any "訂購資訊" required field is empty: `customerName`, `customerPhone`, `customerAddress`
- Payment method not selected
- If `credit_card`: any of `cardNumber`, `cardExpiry`, `cardCvv`, `cardholderName` is empty
- If `line_transfer`: `lineId` is empty

### LINE API Feasibility & Approach

**Research finding:** The LINE Messaging API **cannot** send push messages using a LINE ID handle (e.g. `@john123`). It only accepts the internal `userId` (format: `U` + 32 hex characters), which can only be obtained through LINE Login OAuth or webhook events. There is **no LINE API** to convert a LINE ID handle to a userId. ([LINE Developers docs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/))

**Adjusted approach for "透過 LINE 聯繫" flow:**

1. **Store customer LINE ID in order** — A new `customer_line_id` column in the `orders` table stores the LINE ID handle the customer entered. This is distinct from the existing `line_user_id` column (which stores the internal LINE userId from OAuth).

2. **Include LINE ID in admin flex message** — When the order is sent to the admin via LINE push message, the flex message now includes a "Customer LINE ID: @xxx" line. The admin can search for this LINE ID in the LINE app and manually initiate a conversation about the bank transfer.

3. **Automated push to customer (if available)** — If the customer is logged in via LINE Login, their internal `line_user_id` is already in the `profiles` table. The existing `sendOrderMessage()` flow automatically pushes the order confirmation to them. This is a bonus — works when available, gracefully skipped when not.

4. **Admin always receives the order** — The `sendOrderToAdmin()` call ensures the bakery admin always gets notified via LINE, regardless of whether the customer can receive automated messages.

**Why not collect LINE userId directly?** Asking users to find and paste their internal LINE userId (a 33-character hex string) is impractical. LINE ID handles are what users know and share. The admin-mediated contact flow is the standard pattern for LINE-integrated small businesses.

### Architecture

- **Frontend**: `react-hook-form` + `zod` for form validation, shadcn `Select` + `Form` components
- **Backend**: `CreateOrderDto` accepts optional `customer_line_id`, stored in orders table
- **Shared types**: `CreateOrderRequest` updated with `customer_line_id?: string`
- **Database**: New `customer_line_id` text column on `orders` table
- **LINE flex message**: Updated to include customer LINE ID when present
- **i18n**: New keys added to both `zh.json` and `en.json`

## Testing Strategy

- **Manual testing**: Verify both payment method flows in the browser
  - Default state: no payment method selected, no CTA visible
  - Select credit card → 4 fields appear, CTA disabled until all filled
  - Select LINE → LINE ID field appears, CTA disabled until filled
  - Switch between methods → fields reset, CTA updates
  - Fill all fields → CTA enabled, click triggers correct checkout flow
  - Verify Order Summary sidebar no longer has CTA buttons
- **Edge cases**:
  - Switch payment method after filling fields → previous fields should clear
  - Fill credit card fields, clear one → CTA re-disables
  - Mobile layout: section stacks properly below customer info

## Out of Scope

- Backend storage of credit card info (Lemon Squeezy handles payment)
- Actual credit card processing or Luhn validation
- Automated LINE push to customers who haven't logged in via LINE (API limitation)
- LINE userId lookup from LINE ID handle (no such API exists)
- Any changes to the checkout success flow or order confirmation

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
