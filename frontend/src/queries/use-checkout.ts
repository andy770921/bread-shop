import { useMutation } from '@tanstack/react-query';
import type { CartResponse } from '@repo/shared';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';

export interface LineCheckoutStartResponse {
  pendingId: string;
  next: 'line_login' | 'confirm' | 'not_friend';
  add_friend_url?: string;
}

export interface StartLineCheckoutBody {
  form_data: Record<string, unknown>;
  cart_snapshot?: CartResponse;
}

export interface ConfirmPendingLineOrderResponse {
  success: boolean;
  order_number: string | null;
}

export function useStartLineCheckout() {
  return useMutation({
    mutationFn: (body: StartLineCheckoutBody) =>
      authedFetchFn<LineCheckoutStartResponse>('api/auth/line/start', { method: 'POST', body }),
  });
}

export function useConfirmPendingLineOrder() {
  return useMutation({
    mutationFn: (pendingId: string) =>
      authedFetchFn<ConfirmPendingLineOrderResponse>('api/auth/line/confirm-order', {
        method: 'POST',
        body: { pendingId },
      }),
  });
}
