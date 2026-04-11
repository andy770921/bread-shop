import type { OrderStatus } from '@repo/shared';

const statusColorMap: Record<string, React.CSSProperties> = {
  pending: { backgroundColor: '#FEF3C7', color: '#92400E' },
  paid: { backgroundColor: '#D1FAE5', color: '#065F46' },
  preparing: { backgroundColor: '#DBEAFE', color: '#1E40AF' },
  shipping: { backgroundColor: '#E0E7FF', color: '#3730A3' },
  delivered: { backgroundColor: '#D1FAE5', color: '#065F46' },
  cancelled: { backgroundColor: '#FEE2E2', color: '#991B1B' },
};

export function getStatusColor(status: OrderStatus): React.CSSProperties {
  return statusColorMap[status] ?? {};
}
