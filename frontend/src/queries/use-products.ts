import { useQuery } from '@tanstack/react-query';
import { ProductListResponse } from '@repo/shared';

export function useProducts(category?: string) {
  const params = category ? `?category=${category}` : '';

  return useQuery<ProductListResponse>({
    queryKey: ['products', category || 'all'],
    queryFn: async () => {
      const res = await fetch(`/api/products${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
    staleTime: 60 * 1000,
  });
}
