'use client';

import { useCallback } from 'react';
import type { CartResponse } from '@repo/shared';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { redirectTo } from '@/lib/browser-navigation';
import { useConfirmPendingLineOrder, useStartLineCheckout } from '@/queries/use-checkout';
import { QUERY_KEYS } from '@/queries/query-keys';
import { flushPendingCartMutations } from '@/queries/use-debounced-cart-mutation';
import { CartFormValues } from './cart-form';

export type CheckoutSubmitResult =
  | { status: 'completed' }
  | { status: 'redirected' }
  | { status: 'needs_friend'; addFriendUrl: string };

export function extractCheckoutErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const bodyMessage = (error as { body?: { message?: string | string[] } }).body?.message;
  if (Array.isArray(bodyMessage)) {
    return bodyMessage[0];
  }

  if (typeof bodyMessage === 'string') {
    return bodyMessage;
  }

  return error instanceof Error ? error.message : undefined;
}

export function useCheckoutFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { mutateAsync: startLineCheckout } = useStartLineCheckout();
  const { mutateAsync: confirmPendingLineOrder } = useConfirmPendingLineOrder();
  const hasLineUserId = Boolean(user?.line_user_id);

  const submitCheckout = useCallback(
    async (values: CartFormValues): Promise<CheckoutSubmitResult> => {
      await flushPendingCartMutations();

      if (values.paymentMethod === 'credit_card') {
        throw new Error('Credit card service is currently unavailable.');
      }

      const checkoutCartSnapshot = queryClient.getQueryData<CartResponse>(QUERY_KEYS.cart);

      const start = await startLineCheckout({
        form_data: values,
        cart_snapshot: checkoutCartSnapshot,
      });

      if (start.next === 'line_login') {
        redirectTo(`/api/auth/line?pending=${start.pendingId}`);
        return { status: 'redirected' };
      }

      if (start.next === 'not_friend') {
        return {
          status: 'needs_friend',
          addFriendUrl: start.add_friend_url || '',
        };
      }

      const confirmed = await confirmPendingLineOrder(start.pendingId);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart });
      if (confirmed.order_number) {
        router.push(`/checkout/success?order=${confirmed.order_number}`);
      } else {
        router.push('/checkout/success');
      }
      return { status: 'completed' };
    },
    [confirmPendingLineOrder, queryClient, router, startLineCheckout],
  );

  return {
    hasLineUserId,
    submitCheckout,
  };
}
