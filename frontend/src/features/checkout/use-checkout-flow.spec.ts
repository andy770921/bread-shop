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
  useStartLineCheckout: jest.fn(),
  useConfirmPendingLineOrder: jest.fn(),
}));

jest.mock('@/lib/browser-navigation', () => ({
  redirectTo: jest.fn(),
}));

jest.mock('@/queries/use-debounced-cart-mutation', () => ({
  flushPendingCartMutations: jest.fn(),
}));

jest.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'zh', t: (key: string) => key, toggleLocale: jest.fn() }),
}));

jest.mock('@/queries/use-pickup-availability', () => ({
  PICKUP_AVAILABILITY_KEY: ['api', 'pickup-availability'],
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

describe('[useCheckoutFlow]', () => {
  const push = jest.fn();
  const invalidateQueries = jest.fn().mockResolvedValue(undefined);
  const setQueryData = jest.fn();
  const startLineCheckout = jest.fn();
  const confirmPendingLineOrder = jest.fn();
  const redirectTo = jest.fn();
  const baseValues: CartFormValues = {
    customerName: 'Andy',
    customerPhone: '0912345678',
    customerEmail: 'andy@example.com',
    customerAddress: 'Taipei',
    notes: 'Ring bell',
    paymentMethod: 'line_transfer',
    lineId: '@andy',
    pickup: {
      method: 'in_person',
      locationId: '07a54160-795d-4943-8338-1be861253ecb',
      date: new Date('2099-12-31T00:00:00+08:00'),
      timeSlot: '15:00',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const { useRouter } = jest.requireMock('next/navigation');
    const { useQueryClient } = jest.requireMock('@tanstack/react-query');
    const { useAuth } = jest.requireMock('@/lib/auth-context');
    const { redirectTo: mockRedirectTo } = jest.requireMock('@/lib/browser-navigation');
    const { flushPendingCartMutations } = jest.requireMock('@/queries/use-debounced-cart-mutation');
    const { useStartLineCheckout, useConfirmPendingLineOrder } =
      jest.requireMock('@/queries/use-checkout');

    useRouter.mockReturnValue({ push });
    useQueryClient.mockReturnValue({ invalidateQueries, setQueryData });
    useAuth.mockReturnValue({ user: null });
    useStartLineCheckout.mockReturnValue({ mutateAsync: startLineCheckout });
    useConfirmPendingLineOrder.mockReturnValue({ mutateAsync: confirmPendingLineOrder });
    flushPendingCartMutations.mockResolvedValue(undefined);
    mockRedirectTo.mockImplementation(redirectTo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts LINE login when the shopper has not linked a LINE account yet', async () => {
    const { flushPendingCartMutations } = jest.requireMock('@/queries/use-debounced-cart-mutation');
    startLineCheckout.mockResolvedValue({ pendingId: 'pending-1', next: 'line_login' });

    const { result } = renderHook(() => useCheckoutFlow());

    await act(async () => {
      await expect(result.current.submitCheckout(baseValues)).resolves.toEqual({
        status: 'redirected',
      });
    });

    expect(startLineCheckout).toHaveBeenCalledWith({
      form_data: expect.objectContaining({
        customerName: baseValues.customerName,
        pickup_method: 'in_person',
        pickup_location_id: baseValues.pickup.locationId,
        pickup_at: expect.stringMatching(/T15:00:00\+08:00$/),
      }),
    });
    expect(flushPendingCartMutations).toHaveBeenCalled();
    expect(redirectTo).toHaveBeenCalledWith('/api/auth/line?pending=pending-1');
    expect(confirmPendingLineOrder).not.toHaveBeenCalled();
  });

  it('completes the linked LINE checkout flow from the pending draft and clears cart cache', async () => {
    const { useAuth } = jest.requireMock('@/lib/auth-context');
    useAuth.mockReturnValue({ user: { line_user_id: 'line-user-1' } });
    startLineCheckout.mockResolvedValue({ pendingId: 'pending-9', next: 'confirm' });
    confirmPendingLineOrder.mockResolvedValue({ success: true, order_number: 'ORD-9' });

    const { result } = renderHook(() => useCheckoutFlow());

    await act(async () => {
      await expect(result.current.submitCheckout(baseValues)).resolves.toEqual({
        status: 'completed',
      });
    });

    expect(startLineCheckout).toHaveBeenCalledWith({
      form_data: expect.objectContaining({
        customerName: baseValues.customerName,
        pickup_method: 'in_person',
        pickup_location_id: baseValues.pickup.locationId,
        pickup_at: expect.stringMatching(/T15:00:00\+08:00$/),
      }),
    });
    expect(confirmPendingLineOrder).toHaveBeenCalledWith('pending-9');
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: QUERY_KEYS.cart });
    expect(setQueryData).toHaveBeenCalledWith(QUERY_KEYS.cartContactDraft, null);
    expect(push).toHaveBeenCalledWith('/checkout/success?order=ORD-9');
  });

  it('stops before pending-order confirmation when a linked LINE user has blocked the official account', async () => {
    const { useAuth } = jest.requireMock('@/lib/auth-context');
    useAuth.mockReturnValue({ user: { line_user_id: 'line-user-1' } });
    startLineCheckout.mockResolvedValue({
      pendingId: 'pending-2',
      next: 'not_friend',
      add_friend_url: 'https://line.me/friend',
    });

    const { result } = renderHook(() => useCheckoutFlow());

    await act(async () => {
      await expect(result.current.submitCheckout(baseValues)).resolves.toEqual({
        status: 'needs_friend',
        addFriendUrl: 'https://line.me/friend',
      });
    });

    expect(confirmPendingLineOrder).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(setQueryData).not.toHaveBeenCalledWith(QUERY_KEYS.cartContactDraft, null);
  });

  it('does not clear draft cache when redirecting to LINE login', async () => {
    startLineCheckout.mockResolvedValue({ pendingId: 'pending-1', next: 'line_login' });

    const { result } = renderHook(() => useCheckoutFlow());

    await act(async () => {
      await result.current.submitCheckout(baseValues);
    });

    expect(setQueryData).not.toHaveBeenCalledWith(QUERY_KEYS.cartContactDraft, null);
  });

  it('rejects credit-card submission before any order is created', async () => {
    const { result } = renderHook(() => useCheckoutFlow());

    await act(async () => {
      await expect(
        result.current.submitCheckout({
          ...baseValues,
          paymentMethod: 'credit_card',
        }),
      ).rejects.toThrow('Credit card service is currently unavailable.');
    });

    expect(startLineCheckout).not.toHaveBeenCalled();
    expect(confirmPendingLineOrder).not.toHaveBeenCalled();
  });
});
