import { useQuery } from '@tanstack/react-query';
import type { ShopSettings } from '@repo/shared';

const KEY = ['api', 'shop-settings'] as const;

export function useShopSettings() {
  return useQuery<ShopSettings>({
    queryKey: KEY,
    staleTime: 30_000,
  });
}
