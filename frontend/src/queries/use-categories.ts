import { useQuery } from '@tanstack/react-query';
import { CategoryListResponse } from '@repo/shared';
import { defaultFetchFn } from '@/utils/fetchers/fetchers.client';

export function useCategories() {
  return useQuery<CategoryListResponse>({
    queryKey: ['categories'],
    queryFn: () => defaultFetchFn<CategoryListResponse>('api/categories'),
    staleTime: 5 * 60 * 1000,
  });
}
