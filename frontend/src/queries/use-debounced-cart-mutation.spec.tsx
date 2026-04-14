import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CartResponse } from '@repo/shared';
import { useDebouncedCartMutation } from './use-debounced-cart-mutation';
import { QUERY_KEYS } from './query-keys';
import { EMPTY_CART } from '@/utils/cart-math';

describe('[useDebouncedCartMutation]', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('serializes pending entry sends so multiple products do not create carts concurrently', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<CartResponse>(QUERY_KEYS.cart, EMPTY_CART);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    let resolveFirst: ((cart: CartResponse) => void) | null = null;
    let resolveSecond: ((cart: CartResponse) => void) | null = null;
    const send = jest
      .fn<Promise<CartResponse>, [number, number]>()
      .mockImplementationOnce(
        () =>
          new Promise<CartResponse>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<CartResponse>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const { result } = renderHook(
      () =>
        useDebouncedCartMutation<number, { productId: number }>({
          getKey: ({ productId }) => productId,
          getInitialQuantity: () => 1,
          updatePendingEntry: (entry) => {
            entry.quantity += 1;
          },
          applyOptimistic: (cart) => cart,
          send,
          reconcile: (serverCart) => serverCart,
        }),
      { wrapper },
    );

    act(() => {
      result.current.run({ productId: 101 });
      result.current.run({ productId: 202 });
      jest.advanceTimersByTime(500);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenNthCalledWith(1, 101, 1);

    await act(async () => {
      resolveFirst?.({
        ...EMPTY_CART,
        cart_id: 'cart-1',
        version: 1,
      });
      await Promise.resolve();
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, 202, 1);

    await act(async () => {
      resolveSecond?.({
        ...EMPTY_CART,
        cart_id: 'cart-1',
        version: 2,
      });
      await Promise.resolve();
    });
  });
});
