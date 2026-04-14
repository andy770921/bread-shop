import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useCallback } from 'react';
import { CartResponse } from '@repo/shared';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';

const EMPTY_CART: CartResponse = Object.freeze({
  items: [],
  subtotal: 0,
  shipping_fee: 0,
  total: 0,
  item_count: 0,
});

export function useCart() {
  return useQuery<CartResponse>({
    queryKey: ['cart'],
    queryFn: async () => {
      try {
        return await authedFetchFn<CartResponse>('api/cart');
      } catch {
        // Return empty cart if no session yet (first visit)
        return EMPTY_CART;
      }
    },
  });
}

interface PendingEntry {
  quantity: number;
  timer: ReturnType<typeof setTimeout>;
}

function recalcCartTotals(items: CartResponse['items']): CartResponse {
  const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
  const shipping_fee = subtotal >= 500 ? 0 : subtotal === 0 ? 0 : 60;
  return {
    items,
    subtotal,
    shipping_fee,
    total: subtotal + shipping_fee,
    item_count: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

function reconcileWithPending(
  serverCart: CartResponse,
  pending: Map<number, PendingEntry>,
  optimisticCache?: CartResponse,
): CartResponse {
  const serverProductIds = new Set(serverCart.items.map((i) => i.product_id));

  // For items in the server response: if they are still pending, prefer the
  // optimistic cache value (avoids double-counting the delta that the server
  // may have already applied). Otherwise trust the server.
  const items = serverCart.items.map((item) => {
    if (pending.has(item.product_id) && optimisticCache) {
      const cacheItem = optimisticCache.items.find((i) => i.product_id === item.product_id);
      if (cacheItem) return cacheItem;
    }
    return item;
  });

  // Preserve ALL cache items not present in the server response — not just
  // pending ones.  A stale out-of-order response may omit products that were
  // already confirmed by an earlier-received response; dropping them here
  // would silently remove items from the cart.
  if (optimisticCache) {
    for (const item of optimisticCache.items) {
      if (!serverProductIds.has(item.product_id)) {
        items.push(item);
      }
    }
  }

  return recalcCartTotals(items);
}

export function useAddToCart(options?: { onError?: () => void }) {
  const queryClient = useQueryClient();
  const pendingRef = useRef<Map<number, PendingEntry>>(new Map());
  const serverCartRef = useRef<CartResponse | null>(null);
  const onErrorRef = useRef(options?.onError);
  onErrorRef.current = options?.onError;

  const addToCart = useCallback(
    (productId: number, productPrice: number) => {
      // Save server state before first optimistic update in this burst
      if (!serverCartRef.current) {
        serverCartRef.current = queryClient.getQueryData<CartResponse>(['cart']) ?? {
          ...EMPTY_CART,
          items: [],
        };
      }

      // 1. Optimistic cache update
      queryClient.setQueryData<CartResponse>(['cart'], (old) => {
        const cart = old ?? { ...EMPTY_CART, items: [] };
        const existing = cart.items.find((i) => i.product_id === productId);

        const newItems = existing
          ? cart.items.map((item) =>
              item.product_id === productId
                ? {
                    ...item,
                    quantity: Math.min(item.quantity + 1, 99),
                    line_total: Math.min(item.quantity + 1, 99) * item.product.price,
                  }
                : item,
            )
          : [
              ...cart.items,
              {
                id: -(Date.now() + Math.random()),
                product_id: productId,
                quantity: 1,
                product: {
                  id: productId,
                  name_zh: '',
                  name_en: '',
                  price: productPrice,
                  image_url: null,
                  category_name_zh: '',
                  category_name_en: '',
                },
                line_total: productPrice,
              },
            ];

        return recalcCartTotals(newItems);
      });

      // 2. Accumulate pending quantity + reset debounce timer
      const pending = pendingRef.current;
      const entry = pending.get(productId);
      if (entry) {
        clearTimeout(entry.timer);
        entry.quantity += 1;
      } else {
        pending.set(productId, {
          quantity: 0,
          timer: undefined as unknown as ReturnType<typeof setTimeout>,
        });
        pending.get(productId)!.quantity = 1;
      }

      const p = pending.get(productId)!;
      p.timer = setTimeout(async () => {
        const sentQty = p.quantity;

        try {
          const serverCart = await authedFetchFn<CartResponse>('api/cart/items', {
            method: 'POST',
            body: { product_id: productId, quantity: sentQty },
          });
          serverCartRef.current = serverCart;

          // Only delete if user hasn't clicked again during the request
          if (pending.get(productId)?.quantity === sentQty) {
            pending.delete(productId);
          }

          const currentCache = queryClient.getQueryData<CartResponse>(['cart']);
          queryClient.setQueryData(
            ['cart'],
            reconcileWithPending(serverCart, pending, currentCache),
          );
        } catch {
          if (pending.get(productId)?.quantity === sentQty) {
            pending.delete(productId);
          }
          const rollback = serverCartRef.current ?? { ...EMPTY_CART, items: [] };
          const cache = queryClient.getQueryData<CartResponse>(['cart']);
          queryClient.setQueryData(['cart'], reconcileWithPending(rollback, pending, cache));
          onErrorRef.current?.();
        }
      }, 500);
    },
    [queryClient],
  );

  return { addToCart };
}

function applyPendingUpdates(cart: CartResponse, pending: Map<number, PendingEntry>): CartResponse {
  if (pending.size === 0) return cart;
  const items = cart.items.map((item) => {
    const p = pending.get(item.id);
    if (p) {
      return { ...item, quantity: p.quantity, line_total: p.quantity * item.product.price };
    }
    return item;
  });
  return recalcCartTotals(items);
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();
  const pendingRef = useRef<Map<number, PendingEntry>>(new Map());
  const serverCartRef = useRef<CartResponse | null>(null);

  const updateItem = useCallback(
    (itemId: number, newQuantity: number) => {
      // Save server state before first optimistic update in this burst
      if (!serverCartRef.current) {
        serverCartRef.current = queryClient.getQueryData<CartResponse>(['cart']) ?? {
          ...EMPTY_CART,
          items: [],
        };
      }

      // 1. Optimistic cache update — immediately reflect new quantity
      queryClient.setQueryData<CartResponse>(['cart'], (old) => {
        if (!old) return old;
        const newItems = old.items.map((item) =>
          item.id === itemId
            ? { ...item, quantity: newQuantity, line_total: newQuantity * item.product.price }
            : item,
        );
        return recalcCartTotals(newItems);
      });

      // 2. Set target quantity + reset debounce timer
      const pending = pendingRef.current;
      const entry = pending.get(itemId);
      if (entry) {
        clearTimeout(entry.timer);
        entry.quantity = newQuantity;
      } else {
        pending.set(itemId, {
          quantity: newQuantity,
          timer: undefined as unknown as ReturnType<typeof setTimeout>,
        });
      }

      const p = pending.get(itemId)!;
      p.timer = setTimeout(async () => {
        const sentQty = p.quantity;

        try {
          const serverCart = await authedFetchFn<CartResponse>(`api/cart/items/${itemId}`, {
            method: 'PATCH',
            body: { quantity: sentQty },
          });
          serverCartRef.current = serverCart;

          // Only delete if user hasn't clicked again during the request
          if (pending.get(itemId)?.quantity === sentQty) {
            pending.delete(itemId);
          }

          queryClient.setQueryData(['cart'], applyPendingUpdates(serverCart, pending));
          if (pending.size === 0) serverCartRef.current = null;
        } catch {
          if (pending.get(itemId)?.quantity === sentQty) {
            pending.delete(itemId);
          }
          const rollback = serverCartRef.current ?? { ...EMPTY_CART, items: [] };
          queryClient.setQueryData(['cart'], applyPendingUpdates(rollback, pending));
          if (pending.size === 0) serverCartRef.current = null;
        }
      }, 500);
    },
    [queryClient],
  );

  return { updateItem };
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: number) =>
      authedFetchFn<CartResponse>(`api/cart/items/${itemId}`, { method: 'DELETE' }),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: ['cart'] });
      const previousCart = queryClient.getQueryData<CartResponse>(['cart']);
      queryClient.setQueryData<CartResponse>(['cart'], (old) => {
        if (!old) return old;
        return recalcCartTotals(old.items.filter((item) => item.id !== itemId));
      });
      return { previousCart };
    },
    onError: (_err, _itemId, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['cart'], context.previousCart);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['cart'], data);
    },
  });
}
