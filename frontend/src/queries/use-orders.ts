import { useQuery } from '@tanstack/react-query';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import type { Order, OrderListResponse } from '@repo/shared';

export function useOrders(enabled: boolean) {
  return useQuery<OrderListResponse>({
    queryKey: ['orders'],
    queryFn: () => authedFetchFn<OrderListResponse>('api/orders'),
    enabled,
  });
}

export function useOrder(orderId: string, enabled: boolean) {
  return useQuery<Order>({
    queryKey: ['order', orderId],
    queryFn: () => authedFetchFn<Order>(`api/orders/${orderId}`),
    enabled,
  });
}
