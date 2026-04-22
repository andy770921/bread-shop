import { useQuery } from '@tanstack/react-query';
import type { AdminDashboardStats } from '@repo/shared';

export function useAdminDashboard() {
  return useQuery<AdminDashboardStats>({
    queryKey: ['api', 'admin', 'dashboard'],
    staleTime: 30 * 1000,
  });
}
