import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FeatureFlagsResponse,
  ShopSettings,
  UpdateHomeVisibleCategoriesRequest,
  UpdateShopSettingsRequest,
} from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

const KEY = ['api', 'admin', 'feature-flags'] as const;

export function useFeatureFlags() {
  return useQuery<FeatureFlagsResponse>({ queryKey: KEY });
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
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['api', 'categories'] });
    },
  });
}

export function useUpdateShopSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateShopSettingsRequest) =>
      defaultFetchFn<ShopSettings, UpdateShopSettingsRequest>(
        '/api/admin/feature-flags/shop-settings',
        { method: 'PUT', body },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
