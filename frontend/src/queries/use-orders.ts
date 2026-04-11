import { useQuery } from '@tanstack/react-query';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';

interface OrderListResponse {
  orders: any[];
}

export function useOrders(enabled: boolean) {
  return useQuery<OrderListResponse>({
    queryKey: ['orders'],
    queryFn: () => authedFetchFn<OrderListResponse>('api/orders'),
    enabled,
  });
}

export function useOrder(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => authedFetchFn(`api/orders/${orderId}`),
    enabled,
  });
}
