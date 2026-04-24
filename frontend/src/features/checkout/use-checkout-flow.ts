'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { redirectTo } from '@/lib/browser-navigation';
import { useConfirmPendingLineOrder, useStartLineCheckout } from '@/queries/use-checkout';
import { QUERY_KEYS } from '@/queries/query-keys';
import { flushPendingCartMutations } from '@/queries/use-debounced-cart-mutation';
import { composePickupAt } from '@/features/pickup/pickup-schema';
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

      const { pickup, ...rest } = values;
      if (pickup.method !== 'in_person' || !pickup.locationId || !pickup.date || !pickup.timeSlot) {
        throw new Error('Pickup info is incomplete.');
      }
      const composedFormData = {
        ...rest,
        pickup_method: pickup.method,
        pickup_location_id: pickup.locationId,
        pickup_at: composePickupAt(pickup.date, pickup.timeSlot),
      };

      const start = await startLineCheckout({
        form_data: composedFormData,
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
      queryClient.setQueryData(QUERY_KEYS.cartContactDraft, null);
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
