import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FavoriteListResponse } from '@repo/shared';
import { getAuthHeaders } from '@/lib/api';

export function useFavorites(enabled = false) {
  return useQuery<FavoriteListResponse>({
    queryKey: ['favorites'],
    queryFn: async () => {
      const res = await fetch(`/api/favorites`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch favorites');
      return res.json();
    },
    enabled,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, isFavorited }: { productId: number; isFavorited: boolean }) => {
      const method = isFavorited ? 'DELETE' : 'POST';
      const res = await fetch(`/api/favorites/${productId}`, {
        method,
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to toggle favorite');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
