import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useCallback } from 'react';
import { CartResponse } from '@repo/shared';
import { getAuthHeaders } from '@/lib/api';

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
      const res = await fetch(`/api/cart`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      // Return empty cart if no session yet (first visit)
      if (!res.ok) return EMPTY_CART;
      return res.json();
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
  if (pending.size === 0) return serverCart;

  const serverProductIds = new Set(serverCart.items.map((i) => i.product_id));

  // Adjust server items that have pending deltas
  const items = serverCart.items.map((item) => {
    const p = pending.get(item.product_id);
    if (p) {
      const newQty = Math.min(item.quantity + p.quantity, 99);
      return { ...item, quantity: newQty, line_total: newQty * item.product.price };
    }
    return item;
  });

  // Preserve pending items not yet in server response (from optimistic cache)
  if (optimisticCache) {
    for (const [productId] of pending) {
      if (!serverProductIds.has(productId)) {
        const optimisticItem = optimisticCache.items.find((i) => i.product_id === productId);
        if (optimisticItem) {
          items.push(optimisticItem);
        }
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
        const qty = p.quantity;
        pending.delete(productId);

        try {
          const res = await fetch('/api/cart/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            credentials: 'include',
            body: JSON.stringify({ product_id: productId, quantity: qty }),
          });
          if (!res.ok) throw new Error('Failed to add to cart');
          const serverCart: CartResponse = await res.json();
          serverCartRef.current = serverCart;
          const currentCache = queryClient.getQueryData<CartResponse>(['cart']);
          queryClient.setQueryData(
            ['cart'],
            reconcileWithPending(serverCart, pending, currentCache),
          );
        } catch {
          // Rollback to last known server state + re-apply remaining pending deltas
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

export function useUpdateCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: number; quantity: number }) => {
      const res = await fetch(`/api/cart/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ quantity }),
      });
      if (!res.ok) throw new Error('Failed to update cart');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['cart'], data);
    },
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`/api/cart/items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to remove item');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['cart'], data);
    },
  });
}
