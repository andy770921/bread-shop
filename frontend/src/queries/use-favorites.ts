import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FavoriteListResponse } from '@repo/shared';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';

export function useFavorites(enabled = false) {
  return useQuery<FavoriteListResponse>({
    queryKey: ['favorites'],
    queryFn: () => authedFetchFn<FavoriteListResponse>('api/favorites'),
    enabled,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, isFavorited }: { productId: number; isFavorited: boolean }) => {
      const method = isFavorited ? 'DELETE' : 'POST';
      return authedFetchFn(`api/favorites/${productId}`, { method });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
