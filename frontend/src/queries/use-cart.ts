import { CART_CONSTANTS, type CartItem, type CartResponse } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { QUERY_KEYS } from './query-keys';
import { ensureCartSessionReady, fetchCart, primeCartSessionReady } from './cart-session';
import { useDebouncedCartMutation } from './use-debounced-cart-mutation';
import { useShopSettings } from './use-shop-settings';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import {
  FALLBACK_SHOP_SETTINGS,
  applyPendingUpdates,
  recalcCartTotals,
  reconcileWithPending,
} from '@/utils/cart-math';

type CartProductSnapshot = CartItem['product'];
type AddToCartInput = {
  productId: number;
  product: CartProductSnapshot;
};

export function useCart() {
  return useQuery<CartResponse>({
    queryKey: QUERY_KEYS.cart,
    queryFn: fetchCart,
  });
}

export function useAddToCart(options?: { onError?: () => void }) {
  const { data: shopSettings } = useShopSettings();
  const settings = shopSettings ?? FALLBACK_SHOP_SETTINGS;
  const { run } = useDebouncedCartMutation<number, AddToCartInput>({
    onError: options?.onError,
    getKey: ({ productId }) => productId,
    getInitialQuantity: () => 1,
    updatePendingEntry: (entry) => {
      entry.quantity += 1;
    },
    applyOptimistic: (cart, { productId, product }) => {
      const existing = cart.items.find((item) => item.product_id === productId);
      const items = existing
        ? cart.items.map((item) => {
            if (item.product_id !== productId) {
              return item;
            }

            const nextQuantity = Math.min(item.quantity + 1, CART_CONSTANTS.MAX_ITEM_QUANTITY);
            const mergedProduct = { ...item.product, ...product };
            return {
              ...item,
              product: mergedProduct,
              quantity: nextQuantity,
              line_total: nextQuantity * mergedProduct.price,
            };
          })
        : [
            ...cart.items,
            {
              id: -(Date.now() + Math.random()),
              product_id: productId,
              quantity: 1,
              product,
              line_total: product.price,
            },
          ];

      return recalcCartTotals(items, settings, cart);
    },
    send: async (productId, quantity) => {
      await ensureCartSessionReady();
      return authedFetchFn<CartResponse>('api/cart/items', {
        method: 'POST',
        body: { product_id: productId, quantity },
      });
    },
    reconcile: (serverCart, pending, optimisticCache) =>
      reconcileWithPending(serverCart, pending, settings, optimisticCache),
  });

  const addToCart = useCallback(
    (input: AddToCartInput) => {
      primeCartSessionReady();
      run(input);
    },
    [run],
  );

  return { addToCart };
}

export function useUpdateCartItem() {
  const { data: shopSettings } = useShopSettings();
  const settings = shopSettings ?? FALLBACK_SHOP_SETTINGS;
  const { run } = useDebouncedCartMutation<
    number | string,
    { itemId: number | string; newQuantity: number }
  >({
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
        settings,
        cart,
      );
    },
    send: (itemId, quantity) =>
      authedFetchFn<CartResponse>(`api/cart/items/${itemId}`, {
        method: 'PATCH',
        body: { quantity },
      }),
    reconcile: (serverCart, pending) => applyPendingUpdates(serverCart, pending, settings),
  });

  const updateItem = useCallback(
    (itemId: number | string, newQuantity: number) => {
      run({ itemId, newQuantity });
    },
    [run],
  );

  return { updateItem };
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();
  const { data: shopSettings } = useShopSettings();
  const settings = shopSettings ?? FALLBACK_SHOP_SETTINGS;

  return useMutation({
    mutationFn: (itemId: number | string) =>
      authedFetchFn<CartResponse>(`api/cart/items/${itemId}`, { method: 'DELETE' }),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.cart });
      const previousCart = queryClient.getQueryData<CartResponse>(QUERY_KEYS.cart);
      queryClient.setQueryData<CartResponse>(QUERY_KEYS.cart, (old) => {
        if (!old) return old;
        return recalcCartTotals(
          old.items.filter((item) => item.id !== itemId),
          settings,
          old,
        );
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
