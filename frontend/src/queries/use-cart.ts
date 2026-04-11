import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CartResponse } from '@repo/shared';
import { getAuthHeaders } from '@/lib/api';

const EMPTY_CART: CartResponse = Object.freeze({ items: [], subtotal: 0, shipping_fee: 0, total: 0, item_count: 0 });

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

export function useAddToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, quantity }: { productId: number; quantity: number }) => {
      const res = await fetch(`/api/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ product_id: productId, quantity }),
      });
      if (!res.ok) throw new Error('Failed to add to cart');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['cart'], data);
    },
  });
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
