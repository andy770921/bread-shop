import { useQuery } from '@tanstack/react-query';
import { ProductListResponse } from '@repo/shared';
import { defaultFetchFn } from '@/utils/fetchers/fetchers.client';

export function useProducts(category?: string) {
  const params = category ? `?category=${category}` : '';

  return useQuery<ProductListResponse>({
    queryKey: ['products', category || 'all'],
    queryFn: () => defaultFetchFn<ProductListResponse>(`api/products${params}`),
    staleTime: 60 * 1000,
  });
}
