import { useMutation } from '@tanstack/react-query';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import type { CreateOrderRequest, Order } from '@repo/shared';

type CreateOrderBody = CreateOrderRequest & { skip_cart_clear?: boolean };

export interface LineSendResponse {
  success: boolean;
  needs_friend?: boolean;
  add_friend_url?: string;
  message?: string;
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: (body: CreateOrderBody) =>
      authedFetchFn<Order & { checkout_url?: string }>('api/orders', { method: 'POST', body }),
  });
}

export function useLineSend() {
  return useMutation({
    mutationFn: (orderId: number) =>
      authedFetchFn<LineSendResponse>(`api/orders/${orderId}/line-send`, { method: 'POST' }),
  });
}

export function useConfirmOrder() {
  return useMutation({
    mutationFn: (orderId: number) =>
      authedFetchFn<Order>(`api/orders/${orderId}/confirm`, { method: 'POST' }),
  });
}
