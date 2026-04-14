import { CART_CONSTANTS, CartResponse } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { QUERY_KEYS } from './query-keys';
import { useDebouncedCartMutation } from './use-debounced-cart-mutation';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import {
  EMPTY_CART,
  applyPendingUpdates,
  recalcCartTotals,
  reconcileWithPending,
} from '@/utils/cart-math';

export function useCart() {
  return useQuery<CartResponse>({
    queryKey: QUERY_KEYS.cart,
    queryFn: async () => {
      try {
        return await authedFetchFn<CartResponse>('api/cart');
      } catch {
        return EMPTY_CART;
      }
    },
  });
}

export function useAddToCart(options?: { onError?: () => void }) {
  const { run } = useDebouncedCartMutation<number, { productId: number; productPrice: number }>({
    onError: options?.onError,
    getKey: ({ productId }) => productId,
    getInitialQuantity: () => 1,
    updatePendingEntry: (entry) => {
      entry.quantity += 1;
    },
    applyOptimistic: (cart, { productId, productPrice }) => {
      const existing = cart.items.find((item) => item.product_id === productId);
      const items = existing
        ? cart.items.map((item) => {
            if (item.product_id !== productId) {
              return item;
            }

            const nextQuantity = Math.min(item.quantity + 1, CART_CONSTANTS.MAX_ITEM_QUANTITY);
            return {
              ...item,
              quantity: nextQuantity,
              line_total: nextQuantity * item.product.price,
            };
          })
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

      return recalcCartTotals(items);
    },
    send: (productId, quantity) =>
      authedFetchFn<CartResponse>('api/cart/items', {
        method: 'POST',
        body: { product_id: productId, quantity },
      }),
    reconcile: (serverCart, pending, optimisticCache) =>
      reconcileWithPending(serverCart, pending, optimisticCache),
  });

  const addToCart = useCallback(
    (productId: number, productPrice: number) => {
      run({ productId, productPrice });
    },
    [run],
  );

  return { addToCart };
}

export function useUpdateCartItem() {
  const { run } = useDebouncedCartMutation<number, { itemId: number; newQuantity: number }>({
    getKey: ({ itemId }) => itemId,
    getInitialQuantity: ({ newQuantity }) =>
      Math.min(newQuantity, CART_CONSTANTS.MAX_ITEM_QUANTITY),
    updatePendingEntry: (entry, { newQuantity }) => {
      entry.quantity = Math.min(newQuantity, CART_CONSTANTS.MAX_ITEM_QUANTITY);
    },
    applyOptimistic: (cart, { itemId, newQuantity }) => {
      const nextQuantity = Math.min(newQuantity, CART_CONSTANTS.MAX_ITEM_QUANTITY);
      return recalcCartTotals(
        cart.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                quantity: nextQuantity,
                line_total: nextQuantity * item.product.price,
              }
            : item,
        ),
      );
    },
    send: (itemId, quantity) =>
      authedFetchFn<CartResponse>(`api/cart/items/${itemId}`, {
        method: 'PATCH',
        body: { quantity },
      }),
    reconcile: (serverCart, pending) => applyPendingUpdates(serverCart, pending),
  });

  const updateItem = useCallback(
    (itemId: number, newQuantity: number) => {
      run({ itemId, newQuantity });
    },
    [run],
  );

  return { updateItem };
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: number) =>
      authedFetchFn<CartResponse>(`api/cart/items/${itemId}`, { method: 'DELETE' }),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.cart });
      const previousCart = queryClient.getQueryData<CartResponse>(QUERY_KEYS.cart);
      queryClient.setQueryData<CartResponse>(QUERY_KEYS.cart, (old) => {
        if (!old) return old;
        return recalcCartTotals(old.items.filter((item) => item.id !== itemId));
      });
      return { previousCart };
    },
    onError: (_error, _itemId, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(QUERY_KEYS.cart, context.previousCart);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEYS.cart, data);
    },
  });
}
