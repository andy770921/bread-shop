# PRD: LINE Send Endpoint Hardening & Admin Resend Confirm Dialog

## Problem Statement

Two issues were uncovered while investigating an incident in which the shop owner received a duplicate LINE flex card for an order placed days earlier (order `ORD-20260425-0046`, re-sent at 12:14 AM on 2026-04-29):

1. **Unauthorized customer-facing LINE-send endpoint.** `POST /api/orders/:id/line-send` (`backend/src/line/line.controller.ts`) is reachable by any authenticated user but does **not** verify that the caller owns the target order. It calls `LineService.sendOrderToAdmin(orderId)` (pushing the order's PII — name, phone, address, line ID — to the shop owner's LINE OA) and `LineService.sendOrderMessage(orderId, profile.line_user_id)` (pushing the same PII to the caller's own LINE). The endpoint also has no caller in either frontend, so it is dead code with a privilege-escalation / PII-leak vector.

2. **Admin "Resend LINE Message" button has no safeguard.** In `admin-frontend/src/routes/dashboard/orders/OrderDetail.tsx`, the resend button is a direct mutation — a single click immediately re-pushes the flex card to the customer. A misclick (which is what triggered the duplicate message in the incident) costs the shop a customer-visible duplicate notification, with no way to undo.

## Solution Overview

1. **Remove** the dead `POST /api/orders/:id/line-send` endpoint and its controller. The customer-facing flow already pushes the order summary to the customer's LINE during checkout (`CheckoutService.completePendingLineCheckout`); there is no product use case for an authenticated user to re-trigger it from a generic order ID. Deletion is safer than adding an ownership check because the endpoint serves no current product purpose.
2. **Add a confirm dialog** to the admin "重送 LINE 訊息" button, mirroring the existing delete-confirm pattern used in `HeroSlidesPanel.tsx` and `BottomBlocksPanel.tsx`. The dialog must require an explicit second click before the resend mutation fires.

Out of scope for this ticket (per user direction): no rate limiting, no server-side cooldown, no DB schema changes.

## User Stories

1. As the **shop owner**, I want to be unable to be spammed by arbitrary authenticated users via the public API, so that my OA inbox isn't flooded with PII-bearing flex cards from unrelated orders.
2. As a **customer**, I want my order details (name, phone, address, LINE ID) to never be retrievable by another authenticated user via a generic order ID, so my PII is not exposed.
3. As **admin staff** managing orders, I want a confirmation step before the "Resend LINE Message" button fires, so that a misclick does not immediately spam the customer with a duplicate flex card.

## Implementation Decisions

### Approach for issue #1 — remove vs. ownership check

Considered both:

- **Remove** (chosen): zero callers in the codebase; the customer-side LINE push is already wired through the checkout flow; deleting eliminates the PII-leak vector with the least surface area.
- **Add ownership check** (rejected): would still leave an open endpoint for a feature with no clear product use case; YAGNI.

If a future feature reintroduces a customer-triggered resend, it should be re-designed with an explicit ownership guard, audit log, and rate limit at that time.

### Approach for issue #2 — confirm dialog

The admin frontend already uses shadcn `Dialog` (`admin-frontend/src/components/ui/dialog.tsx`) for delete confirmations (e.g., `HeroSlidesPanel.tsx:241-265`). Reuse that pattern rather than introducing `AlertDialog` (not currently installed) to keep the change minimal and consistent.

### Modules

- **`LineModule` (backend)** — drop `LineController` from the module's `controllers` array; keep `LineService` as a provider+export (still used by `CheckoutModule`, `AuthModule`, `AdminModule`).
- **Admin `OrderDetail` route (frontend)** — wrap the resend button's mutation in a `Dialog`-driven confirm step.

### APIs/Interfaces

- **Removed:** `POST /api/orders/:id/line-send` (no replacement).
- **Unchanged:** `POST /api/admin/orders/:id/resend-line` — the wire contract stays the same; only the FE adds a confirm step before invoking it.

### i18n keys to add (admin frontend)

In `admin-frontend/src/i18n/zh.json` and `en.json`, under the `order.*` namespace:

- `resendConfirmTitle` — dialog title (e.g., zh: `確認重送 LINE 訊息？`, en: `Resend LINE message?`)
- `resendConfirmDesc` — dialog body explaining the customer will receive a duplicate flex card
- `cancel` — cancel button label (reuse existing key if available)

## Testing Strategy

- **Backend:** `npm run build` and `npm run lint` in `backend/` to confirm `LineModule` compiles after removal. `cd backend && npx jest` to confirm no spec regressed (no spec currently references `LineController`, so the deletion should be a no-op for tests).
- **Frontend (admin):** `cd admin-frontend && npm run build`. Manual smoke test: open admin order detail page, click "Resend LINE Message" → confirm dialog appears → cancel closes dialog without firing mutation → confirm fires the existing `useResendLine` mutation and shows the existing success/error toasts.
- **End-to-end manual:** verify in production-like env that a previously authenticated customer hitting `POST /api/orders/:id/line-send` now receives 404, and that the admin resend flow requires two clicks.

## Out of Scope

- Server-side rate limiting or per-order cooldown for `resend-line`.
- Audit logging for admin-triggered LINE resends.
- Any changes to the customer-facing checkout LINE flow.
- Reintroducing a customer-side resend feature (would be a separate PRD).
- Redacting PII in flex cards.

## Status

- [x] Planning
- [ ] In Development
- [ ] Complete
