# Fix: POST /api/orders Returns 400 "Cart is empty" After LINE Login

## Problem

After successfully completing LINE Login OAuth, the user returns to the cart page with items visible. Clicking the "透過 LINE 聯繫" CTA to submit the order results in:

- `POST /api/orders` → **400 Bad Request**
- Frontend toast: "Checkout failed"

## Root Cause

The `getSessionIds()` method in `CartService` returns an **empty session list** when the user is authenticated but their session was never linked to their user account.

### Why the Session Was Never Linked

The LINE OAuth callback flow involves a cross-domain redirect:

1. User is on `papa-bread.vercel.app` (frontend) — `session_id` cookie is set for this domain
2. LINE redirects the browser to `papa-bread-api.vercel.app/api/auth/line/callback` (backend)
3. The backend domain is different from the frontend domain — the `session_id` cookie is **not sent**
4. `req.sessionId` is `undefined` in the callback handler
5. The `mergeSessionOnLogin()` call is guarded by `if (req.sessionId)` — it is skipped
6. The session row retains `user_id = null` (never linked to the LINE user)

### Why getSessionIds() Returned Empty

```typescript
// Before (broken):
private async getSessionIds(sessionId: string, userId?: string): Promise<string[]> {
  if (!userId) return [sessionId];

  const supabase = this.supabaseService.getClient();
  const { data } = await supabase.from('sessions').select('id').eq('user_id', userId);

  return data?.map((s) => s.id) || [sessionId];
}
```

When `userId` is provided:

1. Queries `sessions` table for rows where `user_id = <userId>` → returns `[]` (empty array, because no session was linked)
2. The fallback `|| [sessionId]` does **not** trigger because `[]` is truthy in JavaScript
3. Returns `[]` — an empty session list

### Downstream Effect

```
createOrder(sessionId='358b916e', userId='e49d4d74')
  → getCart(sessionId='358b916e', userId='e49d4d74')
    → getSessionIds('358b916e', 'e49d4d74')
      → queries sessions WHERE user_id = 'e49d4d74' → []
      → [] is truthy → fallback [sessionId] NOT used
      → returns []
    → cart_items WHERE session_id IN () → 0 rows
  → cart.items.length === 0
  → throw BadRequestException('Cart is empty')
```

Confirmed in Supabase API logs: `GET /rest/v1/cart_items?...session_id=in.()...` — the `IN` clause was empty.

## Solution

**File:** `backend/src/cart/cart.service.ts`

Always include the current `sessionId` in the returned list, regardless of whether user-owned sessions are found:

```typescript
// After (fixed):
private async getSessionIds(sessionId: string, userId?: string): Promise<string[]> {
  if (!userId) return [sessionId];

  const supabase = this.supabaseService.getClient();
  const { data } = await supabase.from('sessions').select('id').eq('user_id', userId);

  const ids = new Set(data?.map((s) => s.id) || []);
  ids.add(sessionId); // Always include current session (may not be linked to user yet)
  return [...ids];
}
```

Using a `Set` ensures:

- The current session is always included (even if not linked to the user)
- No duplicate session IDs if the current session IS already in the user's sessions list
- All user-owned sessions from other devices are still included

## Files Modified

| File                               | Change                                                          |
| ---------------------------------- | --------------------------------------------------------------- |
| `backend/src/cart/cart.service.ts` | `getSessionIds()` always includes current `sessionId` via `Set` |

## Why This Wasn't Caught Earlier

- **Local development:** The LINE callback and the cart page share the same domain (`localhost:3000`), so the `session_id` cookie is always sent during the callback. `mergeSessionOnLogin()` runs successfully, and the session is linked to the user. `getSessionIds()` finds the session by `user_id` and works correctly.
- **Vercel production:** The callback is on a different domain (`papa-bread-api.vercel.app`) than the frontend (`papa-bread.vercel.app`). The cookie is not sent, the merge is skipped, and the session is never linked. This only manifests in the cross-domain serverless deployment.

## Related Issues

This fix is part of the LINE OAuth integration flow. See also:

- `documents/FEAT-2/development/send-line-to-user-fix.md` — LINE callback 500 error, hash fragment redirect, and Express `encodeUrl` issues
