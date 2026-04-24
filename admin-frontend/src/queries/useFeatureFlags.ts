import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeatureFlagsResponse, UpdateHomeVisibleCategoriesRequest } from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

export function useFeatureFlags() {
  return useQuery<FeatureFlagsResponse>({
    queryKey: ['api', 'admin', 'feature-flags'],
  });
}

export function useUpdateHomeVisibleCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateHomeVisibleCategoriesRequest) =>
      defaultFetchFn<FeatureFlagsResponse, UpdateHomeVisibleCategoriesRequest>(
        '/api/admin/feature-flags/home-visible-categories',
        { method: 'PUT', body },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api', 'admin', 'feature-flags'] });
      qc.invalidateQueries({ queryKey: ['api', 'categories'] });
    },
  });
}
