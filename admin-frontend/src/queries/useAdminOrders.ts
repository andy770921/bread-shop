import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Order, OrderStatus } from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

export interface AdminOrderListItem {
  id: number;
  order_number: string;
  status: OrderStatus;
  subtotal: number;
  shipping_fee: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  payment_method: string | null;
  line_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminOrderListResponse {
  orders: AdminOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function useAdminOrders(status?: string) {
  return useQuery<AdminOrderListResponse>({
    queryKey: status ? ['api', 'admin', 'orders', { status }] : ['api', 'admin', 'orders'],
  });
}

export function useAdminOrder(id: number | null) {
  return useQuery<Order>({
    queryKey: ['api', 'admin', 'orders', id],
    enabled: id != null,
  });
}

export function useUpdateOrderStatus(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: OrderStatus) =>
      defaultFetchFn(`/api/admin/orders/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api', 'admin', 'orders'] });
    },
  });
}

export function useResendLine(id: number) {
  return useMutation({
    mutationFn: () => defaultFetchFn(`/api/admin/orders/${id}/resend-line`, { method: 'POST' }),
  });
}
