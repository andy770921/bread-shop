import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteContentResponse, UpdateSiteContentRequest } from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

export function useAdminSiteContent() {
  return useQuery<SiteContentResponse>({
    queryKey: ['api', 'admin', 'site-content'],
  });
}

export function useUpsertSiteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: UpdateSiteContentRequest }) =>
      defaultFetchFn(`/api/admin/site-content/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api', 'admin', 'site-content'] });
    },
  });
}

export function useDeleteSiteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      defaultFetchFn(`/api/admin/site-content/${encodeURIComponent(key)}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api', 'admin', 'site-content'] });
    },
  });
}
