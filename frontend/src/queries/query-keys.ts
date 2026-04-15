import { QueryClient } from '@tanstack/react-query';

export const QUERY_KEYS = {
  cart: ['cart'] as const,
  cartContactDraft: ['cart-contact-draft'] as const,
  favorites: ['favorites'] as const,
} as const;

export async function invalidateAuthQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cartContactDraft }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites }),
  ]);
}
