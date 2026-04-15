import type { CartContactDraft, UpsertCartContactDraftRequest } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from './query-keys';
import { ensureCartSessionReady } from './cart-session';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';

async function fetchContactDraft(): Promise<CartContactDraft | null> {
  await ensureCartSessionReady();
  return authedFetchFn<CartContactDraft | null>('api/cart/contact-draft');
}

export function useCartContactDraft() {
  return useQuery<CartContactDraft | null>({
    queryKey: QUERY_KEYS.cartContactDraft,
    queryFn: fetchContactDraft,
  });
}

export function useUpsertCartContactDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertCartContactDraftRequest) =>
      authedFetchFn<CartContactDraft>('api/cart/contact-draft', {
        method: 'PUT',
        body: payload,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEYS.cartContactDraft, data);
    },
  });
}

export function useClearCartContactDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      authedFetchFn<void>('api/cart/contact-draft', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData(QUERY_KEYS.cartContactDraft, null);
    },
  });
}
