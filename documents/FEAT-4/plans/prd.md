# PRD: Secure Persistence for Cart Customer Info Draft

## Problem Statement

Users reported a regression on `/cart`:

1. They enter customer information such as name, phone, and address.
2. They click "Continue Shopping" and return to the homepage.
3. When they later navigate back to `/cart`, all entered values are gone.

This is happening because the current `/cart` form is only stored in in-memory React form state. The page initializes empty `defaultValues`, and there is no persistence boundary between "user started typing" and "user actually submits checkout".

For this feature, the product goal is not only to preserve form progress. It must do so without creating a worse security posture for personally identifiable information (PII), especially for name, phone number, address, email, and free-form notes.

## Current State Verification

The current codebase already proves three important facts:

1. `/cart` form state is ephemeral today.
   - `frontend/src/app/cart/page.tsx` initializes `react-hook-form` with empty `defaultValues`.
   - There is no hydration from browser storage or backend draft data.

2. The project already uses a secure server-side session pattern for cart persistence.
   - `backend/src/common/middleware/session.middleware.ts` issues an opaque `session_id` cookie.
   - The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, and scoped to `/`.
   - Cart items are resolved on the server by `session_id`, not by client-managed cart payloads.

3. The project already has an existing server-side checkout draft pattern.
   - `backend/src/auth/auth.service.ts` stores pending LINE checkout data in `pending_line_orders`.
   - `backend/src/auth/auth.controller.ts` already treats pending order records as a server-side draft boundary before checkout completion.

This means the repository already favors:

- server-side state over client-side sensitive state
- opaque identifiers in cookies
- same-origin API calls through the Next.js `/api/*` proxy

The missing piece is a secure draft layer for cart customer info before checkout is submitted.

## Solution Overview

Introduce a new **server-side cart contact draft** tied to the existing `session_id` cookie.

The browser will no longer be responsible for persisting PII in `sessionStorage`, `localStorage`, or readable cookies. Instead:

1. The `/cart` page debounces and autosaves customer info to a backend draft record.
2. The backend stores only the allowed checkout-contact fields and refreshes a short TTL.
3. When the user returns to `/cart`, the frontend hydrates the form from the server-side draft.
4. On successful checkout, manual reset, cart clear, or draft expiry, the draft is deleted.

This keeps the client-side handle opaque while moving the sensitive state to a controlled server-side boundary.

## Research Summary

### Option A: Store draft values in `sessionStorage`

**What it solves**

- Very easy implementation
- Survives refresh and same-tab navigation
- No backend/API work

**Security and product drawbacks**

- `sessionStorage` is still readable by JavaScript, so any successful XSS can read the stored PII.
- It is tab-scoped, so behavior across multiple tabs or restored tabs is inconsistent.
- It is not aligned with the existing cart architecture, which already uses server-side session state.
- It makes the browser hold the sensitive draft directly, instead of only an opaque session handle.

**Decision**

- Rejected for customer PII
- Acceptable only for low-sensitivity UI state if ever needed in the future

### Option B: Store draft values in client cookies

**What it solves**

- Can persist across navigations
- Cookie transport is already part of the session model

**Security and product drawbacks**

- Readable cookies are also client-side storage of PII.
- Even encrypted/signed cookies increase payload size and broaden exposure surfaces.
- Cookies are a good place for opaque identifiers, not for contact/address payloads.

**Decision**

- Rejected for draft payload storage
- Keep cookies limited to the opaque `session_id`

### Option C: Store the draft on the server, keyed by the existing session cookie

**What it solves**

- Matches the current cart model and existing pending-order architecture
- Keeps PII out of browser Web Storage
- Lets the backend enforce validation, retention, deletion, and audit controls
- Allows future hardening such as field-level encryption without changing the browser contract

**Security and product drawbacks**

- Requires new API and persistence work
- Still sends the data to the server, so transport, logging, and retention must be designed carefully

**Decision**

- Chosen

## Why The Chosen Option Is Secure Enough

The main concern raised in discovery was:

1. `sessionStorage` risks exposing PII in the browser.
2. Sending the data to the backend "as plain API data" seems insecure.

The correct security framing is:

- Sending JSON request bodies over properly configured HTTPS is not "plain text on the wire"; TLS protects confidentiality and integrity in transit.
- The bigger remaining risks are:
  - storing PII in JavaScript-readable browser storage
  - leaking PII into logs, URLs, analytics, or debugging output
  - retaining draft data longer than necessary

So the secure approach is not "avoid backend APIs". The secure approach is:

1. use backend APIs only over HTTPS
2. keep the client-side token opaque
3. keep PII off `sessionStorage` and `localStorage`
4. minimize retention and log exposure
5. add encryption-at-rest later if the threat model requires it

## Final Decision

Implement a **server-side mutable cart contact draft** and treat it as a pre-checkout draft boundary.

### Explicit decision points

1. Do **not** store customer name, phone, address, email, notes, or LINE ID in `sessionStorage`, `localStorage`, or readable cookies.
2. Reuse the existing `session_id` cookie as the only client-side handle.
3. Add a dedicated draft persistence path for `/cart` customer info.
4. Keep the current `pending_line_orders` flow for submit-time checkout orchestration. The new draft is earlier and mutable; the pending order remains later and checkout-specific.
5. Do **not** introduce field-level application encryption in phase 1, but design the storage boundary so it can be added later without breaking the API contract.

### Why field-level encryption is not phase 1

Field-level encryption is a valid defense-in-depth option, but it adds key-management scope and would still leave the project with plaintext handling in existing order/profile flows unless applied consistently. For this regression fix, the stronger immediate win is:

- server-side draft instead of browser storage
- HTTPS-only transport
- short TTL
- strict redaction and deletion rules

The design should stay encryption-ready, but encryption is not required to deliver the first secure version.

## User Stories

1. As a shopper, I want my entered customer info to still be there when I leave `/cart` and come back, so that I do not need to retype it.
2. As a shopper, I want this recovery to happen without exposing my name, phone, and address in browser storage.
3. As the bakery team, I want the solution to match the existing session-based cart architecture, so that security and operational patterns stay consistent.
4. As the engineering team, I want draft retention to be limited and explicitly deletable, so that temporary PII does not linger indefinitely.

## Acceptance Criteria

1. When a user types valid or partial customer info on `/cart`, leaves the page, and returns within the same browser session and before draft expiry, the entered values are restored.
2. Customer PII is not persisted in `sessionStorage`, `localStorage`, or readable cookies.
3. The only browser-stored handle used for restoration is the existing opaque `session_id` cookie.
4. Draft restore works through same-origin backend APIs and does not expose PII in URLs or query strings.
5. Draft data is deleted on successful checkout completion.
6. Draft data can be explicitly cleared by the application.
7. Draft data automatically expires after a short retention window.
8. Server logs, analytics payloads, and error surfaces do not record raw draft values.

## Implementation Decisions

### Modules

- **Frontend Draft Hydration Module**
  - Reads the existing cart session state
  - Loads the saved draft on `/cart` mount
  - Hydrates `react-hook-form`
  - Debounces autosave while the user edits fields

- **Backend Draft API Module**
  - Exposes draft read, upsert, and delete endpoints
  - Resolves records exclusively by current `session_id`
  - Validates and sanitizes the allowed fields

- **Draft Persistence Module**
  - Stores mutable checkout-contact draft data
  - Refreshes expiration on update
  - Supports cleanup on expiry and successful checkout

- **Security and Observability Module**
  - Redacts logs
  - Prevents PII from entering URLs or analytics
  - Preserves existing cookie and proxy guarantees

### Architecture

```text
Cart form (React Hook Form)
  -> debounced autosave over same-origin /api/*
  -> backend resolves opaque session_id cookie
  -> server-side checkout_contact_draft record
  -> /cart reload or return visit hydrates from server

Checkout submit
  -> existing checkout flow continues
  -> successful completion clears mutable cart contact draft
  -> submit-time pending_line_orders remains the checkout orchestration draft
```

### Data Model

Create a dedicated table for mutable `/cart` customer info, for example:

`checkout_contact_drafts`

Suggested columns:

- `id uuid primary key`
- `session_id uuid not null references sessions(id) on delete cascade`
- `user_id uuid null`
- `customer_name text null`
- `customer_phone text null`
- `customer_email text null`
- `customer_address text null`
- `notes text null`
- `payment_method text null`
- `line_id text null`
- `expires_at timestamptz not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Suggested constraints:

- unique index on `session_id`
- indexed `expires_at`
- optional allow-list check on `payment_method`

### Why a dedicated table instead of reusing `pending_line_orders`

`pending_line_orders` is a submit-time checkout draft for LINE orchestration. This feature needs a pre-submit, mutable, frequently updated draft for cart-page recovery. Reusing the same table would blur two different lifecycles:

- **contact draft**: mutable, autosaved while typing
- **pending order**: submit-time artifact used to finish checkout

Keeping them separate makes retention, cleanup, and future migration to explicit checkout drafts clearer.

### APIs / Interfaces

Recommended endpoints:

- `GET /api/cart/contact-draft`
  - Returns the current session's saved draft, or `null`

- `PUT /api/cart/contact-draft`
  - Upserts the full allowed snapshot
  - Refreshes draft TTL
  - Accepts only allowed fields

- `DELETE /api/cart/contact-draft`
  - Deletes the current session's draft

Recommended request body:

```json
{
  "customerName": "Jane Doe",
  "customerPhone": "0912345678",
  "customerEmail": "jane@example.com",
  "customerAddress": "Taipei City ...",
  "notes": "Please ring the bell",
  "paymentMethod": "line_transfer",
  "lineId": "@jane"
}
```

Rules:

- Use JSON body over HTTPS only
- Never place draft payload in URL query strings
- Reject unknown keys
- Strip internal `_`-prefixed fields, matching the existing pending-order hardening pattern

### Frontend Behavior

On `/cart` load:

1. Ensure the existing cart session is ready.
2. Read the contact draft.
3. If a draft exists, hydrate form values from it.
4. If no draft exists, preserve the current empty-form behavior.

During editing:

1. Watch allowed fields only.
2. Debounce autosave to avoid sending a request on every keystroke.
3. Flush pending autosave on:
   - clicking "Continue Shopping"
   - page visibility change
   - route leave/unmount, where feasible

Suggested autosave strategy:

- debounce window: 500-1000 ms
- last-write-wins semantics are acceptable for this feature

### Security Controls

#### 1. Client-side storage boundary

- Browser storage must hold only the opaque session cookie.
- No PII in `sessionStorage`, `localStorage`, readable cookies, query params, or fragment identifiers.

#### 2. Transport security

- Use same-origin `/api/*` routes only.
- Require HTTPS in production.
- Preserve the existing `HttpOnly`, `SameSite=Lax`, and `Secure` cookie posture.

#### 3. Data minimization

- Store only the fields needed to restore `/cart` progress.
- Do not store any credit-card fields.
- Do not expand scope to cross-device profile sync in this feature.

#### 4. Retention and cleanup

- Rolling TTL: 24 hours from last update
- Delete on:
  - successful checkout
  - explicit reset
  - cart clear
  - expiration cleanup

#### 5. Logging and analytics

- Never log request bodies for draft endpoints.
- Redact or hash session identifiers in operational logs if logging is required.
- Exclude draft fields from analytics, error trackers, and breadcrumbs.

#### 6. Encryption readiness

- Keep the persistence layer structured so application-level or database-level encryption can be added later.
- If future security requirements rise, encrypt `customer_phone`, `customer_email`, `customer_address`, and `notes` at rest first.

### Operational Decisions

- This feature is scoped to **same browser session recovery**, not cross-device synchronization.
- Cart items remain the source of truth for what the user is buying.
- The contact draft only restores input progress; it does not replace final checkout validation.

## Testing Strategy

### Backend

- Unit test draft upsert/read/delete service behavior
- Unit test TTL refresh behavior
- Unit test unknown-key rejection and internal-field stripping
- Unit test delete-on-success integration with checkout completion

### Frontend

- Component/integration test draft hydration into `/cart`
- Test debounced autosave behavior
- Test restoring after navigating from `/cart` to `/` and back
- Test delete behavior after successful checkout

### Security Validation

- Verify no customer PII appears in:
  - `sessionStorage`
  - `localStorage`
  - `document.cookie`
  - URL query strings
  - network requests made over `http://` in production configuration
- Verify draft API requests are same-origin and authenticated only by the existing cookie/session model
- Verify logs do not contain raw request body values

### Manual Regression Scenarios

1. Guest user fills name, phone, address, clicks "Continue Shopping", returns to `/cart`, and sees restored values.
2. Logged-in user repeats the same flow and sees restored values.
3. User clears cart and returns later; draft is gone.
4. User completes checkout successfully; draft is gone.
5. Draft expires after the retention window and is no longer restored.

## Out of Scope

- Cross-device syncing of unfinished contact drafts
- Replacing `pending_line_orders` with full immutable `checkout_drafts`
- Introducing field-level encryption for all existing order/profile PII in the same ticket
- Storing any payment card details
- Changing the overall LINE checkout orchestration

## References

### External References

1. MDN: `sessionStorage` is origin-and-tab scoped, survives reloads, and is cleared when the tab/window closes.
   - https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage

2. OWASP HTML5 Security Cheat Sheet: avoid storing sensitive information in Web Storage; a single XSS can read it, and session identifiers should not be stored there.
   - https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html

3. MDN Secure Cookie Configuration: session cookies should use `Secure`, `HttpOnly`, and restrictive `SameSite` settings.
   - https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies

4. OWASP Session Management Cheat Sheet: the client-side session token should be a meaningless identifier, while the business state lives server-side.
   - https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

5. OWASP Transport Layer Security Cheat Sheet: TLS should be used for all pages and API traffic that handle authenticated sessions or sensitive data.
   - https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html

6. OWASP Web Service Security Cheat Sheet: sensitive service-to-service or client-to-service communication must use well-configured TLS.
   - https://cheatsheetseries.owasp.org/cheatsheets/Web_Service_Security_Cheat_Sheet.html

7. OWASP Cryptographic Storage Cheat Sheet: minimize stored sensitive information, and choose the encryption layer based on threat model.
   - https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html

8. OWASP Logging Cheat Sheet: sensitive personal data, session identifiers, and request bodies should be excluded, masked, hashed, or encrypted in logs.
   - https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

### Internal References

- `frontend/src/app/cart/page.tsx`
- `frontend/src/features/checkout/cart-form.ts`
- `backend/src/common/middleware/session.middleware.ts`
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`
- `documents/FIX-1/plans/race-condition-architecture-revamp.md`
