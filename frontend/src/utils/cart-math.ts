import { CartResponse, ShopSettings } from '@repo/shared';

export interface PendingCartEntry {
  quantity: number;
}

export const FALLBACK_SHOP_SETTINGS: ShopSettings = Object.freeze({
  shippingEnabled: true,
  shippingFee: 60,
  freeShippingThreshold: 500,
  promoBannerEnabled: true,
});

export const EMPTY_CART: CartResponse = Object.freeze({
  cart_id: null,
  version: 0,
  items: [],
  subtotal: 0,
  shipping_fee: 0,
  total: 0,
  item_count: 0,
});

export function recalcCartTotals(
  items: CartResponse['items'],
  settings: ShopSettings,
  meta?: Partial<Pick<CartResponse, 'cart_id' | 'version'>>,
): CartResponse {
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const shipping_fee = !settings.shippingEnabled
    ? 0
    : subtotal === 0
      ? 0
      : subtotal >= settings.freeShippingThreshold
        ? 0
        : settings.shippingFee;

  return {
    cart_id: meta?.cart_id ?? null,
    version: meta?.version ?? 0,
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
  settings: ShopSettings,
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

  return recalcCartTotals(items, settings, serverCart);
}

export function applyPendingUpdates(
  cart: CartResponse,
  pending: ReadonlyMap<number | string, PendingCartEntry>,
  settings: ShopSettings,
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

  return recalcCartTotals(items, settings, cart);
}
