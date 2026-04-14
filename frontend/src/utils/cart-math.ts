import { CART_CONSTANTS, CartResponse } from '@repo/shared';

export interface PendingCartEntry {
  quantity: number;
}

export const EMPTY_CART: CartResponse = Object.freeze({
  items: [],
  subtotal: 0,
  shipping_fee: 0,
  total: 0,
  item_count: 0,
});

export function recalcCartTotals(items: CartResponse['items']): CartResponse {
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const shipping_fee =
    subtotal >= CART_CONSTANTS.FREE_SHIPPING_THRESHOLD
      ? 0
      : subtotal === 0
        ? 0
        : CART_CONSTANTS.SHIPPING_FEE;

  return {
    items,
    subtotal,
    shipping_fee,
    total: subtotal + shipping_fee,
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export function reconcileWithPending(
  serverCart: CartResponse,
  pending: ReadonlyMap<number, PendingCartEntry>,
  optimisticCache?: CartResponse,
): CartResponse {
  const serverProductIds = new Set(serverCart.items.map((item) => item.product_id));

  const items = serverCart.items.map((item) => {
    if (pending.has(item.product_id) && optimisticCache) {
      const cacheItem = optimisticCache.items.find((entry) => entry.product_id === item.product_id);
      if (cacheItem) {
        return cacheItem;
      }
    }

    return item;
  });

  if (optimisticCache) {
    for (const item of optimisticCache.items) {
      if (!serverProductIds.has(item.product_id)) {
        items.push(item);
      }
    }
  }

  return recalcCartTotals(items);
}

export function applyPendingUpdates(
  cart: CartResponse,
  pending: ReadonlyMap<number, PendingCartEntry>,
): CartResponse {
  if (pending.size === 0) {
    return cart;
  }

  const items = cart.items.map((item) => {
    const pendingEntry = pending.get(item.id);
    if (!pendingEntry) {
      return item;
    }

    return {
      ...item,
      quantity: pendingEntry.quantity,
      line_total: pendingEntry.quantity * item.product.price,
    };
  });

  return recalcCartTotals(items);
}
