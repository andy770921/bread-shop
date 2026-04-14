'use client';

import { useCallback } from 'react';
import type { CartResponse } from '@repo/shared';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { redirectTo } from '@/lib/browser-navigation';
import { useConfirmOrder, useCreateOrder, useLineSend } from '@/queries/use-checkout';
import { QUERY_KEYS } from '@/queries/query-keys';
import { flushPendingCartMutations } from '@/queries/use-debounced-cart-mutation';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import { CartFormValues, shouldStartLineLogin, toCreateOrderBody } from './cart-form';

export type CheckoutSubmitResult =
  | { status: 'completed' }
  | { status: 'redirected' }
  | { status: 'needs_friend'; addFriendUrl: string };

interface LineMessageEligibilityResponse {
  can_receive_messages: boolean;
  add_friend_url: string;
}

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
      await flushPendingCartMutations();

      const checkoutCartSnapshot = queryClient.getQueryData<CartResponse>(QUERY_KEYS.cart);

      if (values.paymentMethod === 'credit_card') {
        throw new Error('Credit card service is currently unavailable.');
      }

      if (shouldStartLineLogin(values, hasLineUserId)) {
        const { pendingId } = await authedFetchFn<{ pendingId: string }>('api/auth/line/start', {
          method: 'POST',
          body: { form_data: values, cart_snapshot: checkoutCartSnapshot },
        });
        redirectTo(`/api/auth/line?pending=${pendingId}`);
        return { status: 'redirected' };
      }

      const messageEligibility = await authedFetchFn<LineMessageEligibilityResponse>(
        'api/auth/line/message-eligibility',
      );

      if (!messageEligibility.can_receive_messages) {
        return {
          status: 'needs_friend',
          addFriendUrl: messageEligibility.add_friend_url,
        };
      }

      const orderData = await createOrder(toCreateOrderBody(values, checkoutCartSnapshot));
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
    },
    [confirmOrder, createOrder, hasLineUserId, lineSend, queryClient, router],
  );

  return {
    hasLineUserId,
    submitCheckout,
  };
}
