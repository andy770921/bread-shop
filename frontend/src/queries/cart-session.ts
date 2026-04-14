import { authedFetchFn } from '@/utils/fetchers/fetchers.client';

let cartSessionReady = false;
let cartSessionPromise: Promise<void> | null = null;

async function bootstrapCartSession(): Promise<void> {
  // The cache can be warm while the browser still hasn't committed the HttpOnly
  // session cookie, so we force one real cart round-trip before the first write.
  await authedFetchFn('api/cart');
  cartSessionReady = true;
}

export async function ensureCartSessionReady(): Promise<void> {
  if (cartSessionReady) {
    return;
  }

  if (!cartSessionPromise) {
    cartSessionPromise = bootstrapCartSession().catch((error) => {
      cartSessionPromise = null;
      throw error;
    });
  }

  await cartSessionPromise;
}

export function primeCartSessionReady(): void {
  if (cartSessionReady || cartSessionPromise) {
    return;
  }

  void ensureCartSessionReady().catch(() => undefined);
}

export function resetCartSessionReadyForTests(): void {
  cartSessionReady = false;
  cartSessionPromise = null;
}
