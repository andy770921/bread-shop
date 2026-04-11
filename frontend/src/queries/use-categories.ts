import { useQuery } from '@tanstack/react-query';
import { CategoryListResponse } from '@repo/shared';

export function useCategories() {
  return useQuery<CategoryListResponse>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch(`/api/categories`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
