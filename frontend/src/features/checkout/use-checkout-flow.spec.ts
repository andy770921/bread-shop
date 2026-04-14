import { act, renderHook } from '@testing-library/react';
import { useCheckoutFlow } from './use-checkout-flow';
import type { CartFormValues } from './cart-form';
import { QUERY_KEYS } from '@/queries/query-keys';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/queries/use-checkout', () => ({
  useCreateOrder: jest.fn(),
  useLineSend: jest.fn(),
  useConfirmOrder: jest.fn(),
}));

jest.mock('@/utils/fetchers/fetchers.client', () => ({
  authedFetchFn: jest.fn(),
}));

jest.mock('@/lib/browser-navigation', () => ({
  redirectTo: jest.fn(),
}));

describe('[useCheckoutFlow]', () => {
  const push = jest.fn();
  const invalidateQueries = jest.fn().mockResolvedValue(undefined);
  const createOrder = jest.fn();
  const lineSend = jest.fn();
  const confirmOrder = jest.fn();
  const redirectTo = jest.fn();
  const baseValues: CartFormValues = {
    customerName: 'Andy',
    customerPhone: '0912345678',
    customerEmail: 'andy@example.com',
    customerAddress: 'Taipei',
    notes: 'Ring bell',
    paymentMethod: 'line_transfer',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: '',
    cardholderName: '',
    lineId: '@andy',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const { useRouter } = jest.requireMock('next/navigation');
    const { useQueryClient } = jest.requireMock('@tanstack/react-query');
    const { useAuth } = jest.requireMock('@/lib/auth-context');
    const { redirectTo: mockRedirectTo } = jest.requireMock('@/lib/browser-navigation');
    const { useCreateOrder, useLineSend, useConfirmOrder } =
      jest.requireMock('@/queries/use-checkout');

    useRouter.mockReturnValue({ push });
    useQueryClient.mockReturnValue({ invalidateQueries });
    useAuth.mockReturnValue({ user: null });
    useCreateOrder.mockReturnValue({ mutateAsync: createOrder });
    useLineSend.mockReturnValue({ mutateAsync: lineSend });
    useConfirmOrder.mockReturnValue({ mutateAsync: confirmOrder });
    mockRedirectTo.mockImplementation(redirectTo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts LINE login when the shopper has not linked a LINE account yet', async () => {
    const { authedFetchFn } = jest.requireMock('@/utils/fetchers/fetchers.client');
    authedFetchFn.mockResolvedValue({ pendingId: 'pending-1' });

    const { result } = renderHook(() => useCheckoutFlow());

    await act(async () => {
      await expect(result.current.submitCheckout(baseValues)).resolves.toEqual({
        status: 'redirected',
      });
    });

    expect(authedFetchFn).toHaveBeenCalledWith('api/auth/line/start', {
      method: 'POST',
      body: { form_data: baseValues },
    });
    expect(redirectTo).toHaveBeenCalledWith('/api/auth/line?pending=pending-1');
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('completes the linked LINE checkout flow and clears cart cache', async () => {
    const { useAuth } = jest.requireMock('@/lib/auth-context');
    useAuth.mockReturnValue({ user: { line_user_id: 'line-user-1' } });
    createOrder.mockResolvedValue({ id: 9, order_number: 'ORD-9' });
    lineSend.mockResolvedValue({ success: true });
    confirmOrder.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useCheckoutFlow());

    await act(async () => {
      await expect(result.current.submitCheckout(baseValues)).resolves.toEqual({
        status: 'completed',
      });
    });

    expect(createOrder).toHaveBeenCalled();
    expect(lineSend).toHaveBeenCalledWith(9);
    expect(confirmOrder).toHaveBeenCalledWith(9);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: QUERY_KEYS.cart });
    expect(push).toHaveBeenCalledWith('/checkout/success?order=ORD-9');
  });

  it('surfaces add-friend handling as a structured result', async () => {
    const { useAuth } = jest.requireMock('@/lib/auth-context');
    useAuth.mockReturnValue({ user: { line_user_id: 'line-user-1' } });
    createOrder.mockResolvedValue({ id: 9, order_number: 'ORD-9' });
    lineSend.mockResolvedValue({
      success: false,
      needs_friend: true,
      add_friend_url: 'https://line.me/friend',
    });

    const { result } = renderHook(() => useCheckoutFlow());

    await act(async () => {
      await expect(result.current.submitCheckout(baseValues)).resolves.toEqual({
        status: 'needs_friend',
        addFriendUrl: 'https://line.me/friend',
      });
    });

    expect(confirmOrder).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('redirects card checkout to an external checkout URL when present', async () => {
    createOrder.mockResolvedValue({
      id: 10,
      order_number: 'ORD-10',
      checkout_url: 'https://pay.test',
    });

    const { result } = renderHook(() => useCheckoutFlow());

    await act(async () => {
      await expect(
        result.current.submitCheckout({
          ...baseValues,
          paymentMethod: 'credit_card',
          cardNumber: '4111111111111111',
          cardExpiry: '12/30',
          cardCvv: '123',
          cardholderName: 'Andy',
        }),
      ).resolves.toEqual({ status: 'redirected' });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: QUERY_KEYS.cart });
    expect(redirectTo).toHaveBeenCalledWith('https://pay.test');
  });
});
