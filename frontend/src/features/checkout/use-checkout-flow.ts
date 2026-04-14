'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { redirectTo } from '@/lib/browser-navigation';
import { useConfirmOrder, useCreateOrder, useLineSend } from '@/queries/use-checkout';
import { QUERY_KEYS } from '@/queries/query-keys';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import { CartFormValues, shouldStartLineLogin, toCreateOrderBody } from './cart-form';

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
  const { mutateAsync: createOrder } = useCreateOrder();
  const { mutateAsync: lineSend } = useLineSend();
  const { mutateAsync: confirmOrder } = useConfirmOrder();
  const hasLineUserId = Boolean(user?.line_user_id);

  const submitCheckout = useCallback(
    async (values: CartFormValues): Promise<CheckoutSubmitResult> => {
      if (shouldStartLineLogin(values, hasLineUserId)) {
        const { pendingId } = await authedFetchFn<{ pendingId: string }>('api/auth/line/start', {
          method: 'POST',
          body: { form_data: values },
        });
        redirectTo(`/api/auth/line?pending=${pendingId}`);
        return { status: 'redirected' };
      }

      const orderData = await createOrder(toCreateOrderBody(values));
      const isLineTransfer = values.paymentMethod === 'line_transfer';

      if (isLineTransfer) {
        const lineData = await lineSend(orderData.id);

        if (!lineData?.success) {
          if (lineData?.needs_friend && lineData?.add_friend_url) {
            return {
              status: 'needs_friend',
              addFriendUrl: lineData.add_friend_url,
            };
          }

          throw new Error(lineData?.message || 'Failed to send order via LINE');
        }

        await confirmOrder(orderData.id);
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart });
        router.push(`/checkout/success?order=${orderData.order_number}`);
        return { status: 'completed' };
      }

      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart });

      if (orderData.checkout_url) {
        redirectTo(orderData.checkout_url);
        return { status: 'redirected' };
      }

      router.push(`/checkout/success?order=${orderData.order_number}`);
      return { status: 'completed' };
    },
    [confirmOrder, createOrder, hasLineUserId, lineSend, queryClient, router],
  );

  return {
    hasLineUserId,
    submitCheckout,
  };
}
