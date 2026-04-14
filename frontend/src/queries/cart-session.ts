import type { CartResponse } from '@repo/shared';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import { EMPTY_CART } from '@/utils/cart-math';

let cartSessionReady = false;
let cartSessionPromise: Promise<CartResponse> | null = null;

async function bootstrapCartSession(): Promise<CartResponse> {
  if (!cartSessionPromise) {
    cartSessionPromise = authedFetchFn<CartResponse>('api/cart')
      .then((data) => {
        cartSessionReady = true;
        return data;
      })
      .catch((error) => {
        cartSessionPromise = null;
        throw error;
      });
  }

  return cartSessionPromise;
}

/**
 * Allows tests or future call sites to mark the bootstrap as complete only
 * after a real GET /api/cart response has already established the cookie.
 */
export function markCartSessionReady(): void {
  cartSessionReady = true;
}

/**
 * Shared query function for useCart().
 *
 * Before the first successful GET /api/cart, reuse the single bootstrap request
 * so all callers wait for the same Set-Cookie response. After bootstrap is done,
 * each query execution performs a normal fetch again.
 */
export async function fetchCart(): Promise<CartResponse> {
  try {
    if (!cartSessionReady) {
      return await bootstrapCartSession();
    }

    return await authedFetchFn<CartResponse>('api/cart');
  } catch {
    return EMPTY_CART;
  }
}

/**
 * Ensures the browser has a stable session_id cookie before any cart write.
 *
 * This must wait for a real GET /api/cart response. Query cache data alone is
 * not enough, because optimistic setQueryData() can populate ['cart'] before
 * any Set-Cookie response has reached the browser.
 */
export async function ensureCartSessionReady(): Promise<void> {
  if (cartSessionReady) return;
  await bootstrapCartSession();
}

export function primeCartSessionReady(): void {
  if (cartSessionReady || cartSessionPromise) return;
  void bootstrapCartSession().catch(() => undefined);
}

export function resetCartSessionReadyForTests(): void {
  cartSessionReady = false;
  cartSessionPromise = null;
}
