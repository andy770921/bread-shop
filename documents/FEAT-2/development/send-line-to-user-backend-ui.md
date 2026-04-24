# Fix: Loading Spinner During Server-Side Order Processing

## Problem

After deploying all LINE order flow fixes (3a–3c), the flow works correctly:

1. User fills cart + form + LINE ID → clicks CTA
2. `POST /api/auth/line/start` stores form data server-side
3. LINE OAuth redirect → user authenticates
4. Backend callback creates order, sends LINE message, redirects to `/checkout/success`

**But during step 4**, the backend takes ~3 seconds to process (LINE token exchange + order creation + LINE message push). During this time, the browser shows a **blank black page** because it's waiting for the HTTP response (a 302 redirect) to complete.

### Why the blank page happens

The previous flow used a standard HTTP 302 redirect:

```
Browser → GET /api/auth/line/callback
           ↓
         Backend processes for ~3 seconds (token exchange, order creation, LINE push)
           ↓
         302 Location: /checkout/success?order=ORD-xxx
           ↓
Browser receives redirect, navigates to success page
```

The browser cannot render anything until it receives the HTTP response. A 302 redirect has no body — the browser shows whatever default blank page it has (white or black depending on dark mode / LINE in-app browser settings).

Before fix-3, the backend redirected to the frontend `/auth/callback` page immediately (which showed "Authenticating..."), and the frontend did the order creation. Fix-3 moved order creation to the backend (to avoid localStorage/cookie issues on mobile), but introduced this blank-screen wait.

## Solution: Streaming HTML Response

Instead of returning a 302 redirect (which the browser can't render until complete), the backend now **streams an HTML page** in two parts:

### Part 1: Immediate (before processing)

The backend immediately sends a `200 OK` response with an HTML page containing a CSS-only loading spinner:

```
Browser → GET /api/auth/line/callback
           ↓
         Backend immediately sends HTML with spinner
           ↓
Browser renders "Processing your order..." with animated spinner
```

### Part 2: After processing completes

After the backend finishes order creation and LINE messages, it appends a `<script>` tag to the already-open HTML response that triggers a client-side redirect:

```
         Backend finishes processing (~3s)
           ↓
         Appends: <script>window.location.href='/checkout/success?order=ORD-xxx#tokens'</script>
           ↓
Browser executes script, navigates to success page
```

If processing fails, the script redirects to `/cart?error=...` instead.

### Why streaming works

HTTP responses can be sent incrementally using chunked transfer encoding. The backend:

1. Calls `res.writeHead(200, { 'Content-Type': 'text/html' })` — starts the response
2. Calls `res.write(htmlWithSpinner)` — sends the loading page
3. Calls `res.flushHeaders()` — ensures the data is sent to the client immediately
4. Does the heavy processing (3 seconds)
5. Calls `res.write('<script>window.location.href=...')</script>')` — sends the redirect
6. Calls `res.end()` — closes the response

The browser receives and renders the HTML from step 2 while the backend is still processing in steps 3–4.

## Implementation

### `sendLoadingPage(res)` — New helper method

Sends a complete HTML document with:

- Bakery-themed styling (`#f5f0eb` background, `#c07545` accent — matches the frontend design tokens)
- CSS-only spinner animation (no JavaScript needed for the spinner itself)
- "Processing your order..." text
- Mobile-friendly viewport meta tag
- `Cache-Control: no-store` to prevent caching of this transient page

The HTML is minimal (~600 bytes) to ensure fast delivery even on slow connections.

### `lineCallback` — Updated flow

```typescript
if (pending) {
  this.sendLoadingPage(res); // Immediate: browser shows spinner
  try {
    const url = await this.handlePendingOrder(pending, result, frontendUrl);
    res.write(`<script>window.location.href=${JSON.stringify(url)}</script>`);
  } catch (err) {
    const errorUrl = `${frontendUrl}/cart?error=${encodeURIComponent(msg)}`;
    res.write(`<script>window.location.href=${JSON.stringify(errorUrl)}</script>`);
  }
  res.end();
  return;
}
```

### `handlePendingOrder` — Refactored

Changed from directly sending a response (`res.redirect()`) to returning a URL string. The caller (`lineCallback`) controls when and how to send the response. This separation enables the streaming pattern.

**Before:** `handlePendingOrder(pending, authResult, frontendUrl, res): Promise<void>`
**After:** `handlePendingOrder(pending, authResult, frontendUrl): Promise<string>`

## Files Modified

| File                                  | Change                                                                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/auth/auth.controller.ts` | New `sendLoadingPage` helper; `lineCallback` streams HTML for pending order flow; `handlePendingOrder` returns URL string instead of calling `res.redirect` |

## User Experience

| State                    | Before (blank page)             | After (loading spinner)                     |
| ------------------------ | ------------------------------- | ------------------------------------------- |
| Backend processing (~3s) | Black/white blank screen        | Branded spinner: "Processing your order..." |
| Success                  | Redirect to `/checkout/success` | Same — redirect via `<script>`              |
| Error                    | Redirect to `/cart?error=...`   | Same — redirect via `<script>`              |

The spinner uses the bakery's warm color palette and appears instantly, giving the user confidence that the system is working.
