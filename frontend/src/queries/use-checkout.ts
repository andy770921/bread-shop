import { useMutation } from '@tanstack/react-query';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';

interface CreateOrderBody {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address: string;
  notes?: string;
  payment_method: 'lemon_squeezy' | 'line';
  skip_cart_clear?: boolean;
}

interface LineSendResponse {
  success: boolean;
  needs_friend?: boolean;
  add_friend_url?: string;
  message?: string;
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: (body: CreateOrderBody) =>
      authedFetchFn<any>('api/orders', { method: 'POST', body }),
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
      authedFetchFn<any>(`api/orders/${orderId}/confirm`, { method: 'POST' }),
  });
}
