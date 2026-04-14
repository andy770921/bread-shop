import type { QueryClient } from '@tanstack/react-query';
import type { CartResponse } from '@repo/shared';
import { QUERY_KEYS } from './query-keys';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import { EMPTY_CART } from '@/utils/cart-math';

let cartSessionReady = false;
let cartSessionPromise: Promise<void> | null = null;

/**
 * Called by useCart() queryFn after any GET /api/cart completes.
 * This signals that the browser now has a stable session_id cookie.
 */
export function markCartSessionReady(): void {
  cartSessionReady = true;
}

/**
 * Ensures the browser has a stable session_id cookie before any cart write.
 *
 * Uses queryClient.ensureQueryData() to deduplicate with any active useCart()
 * fetch. This prevents a second GET /api/cart that would create a separate
 * anonymous session and cause items to be split across sessions.
 */
export async function ensureCartSessionReady(queryClient: QueryClient): Promise<void> {
  if (cartSessionReady) return;

  if (!cartSessionPromise) {
    cartSessionPromise = queryClient
      .ensureQueryData<CartResponse>({
        queryKey: QUERY_KEYS.cart,
        queryFn: async () => {
          try {
            return await authedFetchFn<CartResponse>('api/cart');
          } catch {
            return EMPTY_CART;
          }
        },
      })
      .then(() => {
        cartSessionReady = true;
      })
      .catch(() => {
        cartSessionPromise = null;
      });
  }

  await cartSessionPromise;
}

export function primeCartSessionReady(queryClient: QueryClient): void {
  if (cartSessionReady) return;
  void ensureCartSessionReady(queryClient).catch(() => undefined);
}

export function resetCartSessionReadyForTests(): void {
  cartSessionReady = false;
  cartSessionPromise = null;
}
