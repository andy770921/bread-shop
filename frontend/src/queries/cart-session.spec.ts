import {
  ensureCartSessionReady,
  fetchCart,
  markCartSessionReady,
  primeCartSessionReady,
  resetCartSessionReadyForTests,
} from './cart-session';

jest.mock('@/utils/fetchers/fetchers.client', () => ({
  authedFetchFn: jest.fn(),
}));

describe('[cart-session]', () => {
  const { authedFetchFn } = jest.requireMock('@/utils/fetchers/fetchers.client') as {
    authedFetchFn: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetCartSessionReadyForTests();
  });

  it('shares one real GET /api/cart bootstrap request across readers and writers', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    authedFetchFn.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const cartPromise = fetchCart();
    const readyPromise = ensureCartSessionReady();

    expect(authedFetchFn).toHaveBeenCalledTimes(1);
    expect(authedFetchFn).toHaveBeenCalledWith('api/cart');

    resolveFetch?.({
      items: [],
      subtotal: 0,
      shipping_fee: 0,
      total: 0,
      item_count: 0,
    });

    await expect(cartPromise).resolves.toEqual({
      items: [],
      subtotal: 0,
      shipping_fee: 0,
      total: 0,
      item_count: 0,
    });
    await expect(readyPromise).resolves.toBeUndefined();
  });

  it('starts the bootstrap in the background only once', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    authedFetchFn.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    primeCartSessionReady();
    primeCartSessionReady();

    expect(authedFetchFn).toHaveBeenCalledTimes(1);

    resolveFetch?.({
      items: [],
      subtotal: 0,
      shipping_fee: 0,
      total: 0,
      item_count: 0,
    });

    await ensureCartSessionReady();
    expect(authedFetchFn).toHaveBeenCalledTimes(1);
  });

  it('performs a fresh cart fetch after the bootstrap is complete', async () => {
    authedFetchFn
      .mockResolvedValueOnce({
        items: [],
        subtotal: 0,
        shipping_fee: 0,
        total: 0,
        item_count: 0,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            product_id: 10,
            quantity: 1,
            product: {
              id: 10,
              name_zh: '吐司',
              name_en: 'Toast',
              price: 100,
              image_url: null,
              category_name_zh: '吐司',
              category_name_en: 'Toast',
            },
            line_total: 100,
          },
        ],
        subtotal: 100,
        shipping_fee: 60,
        total: 160,
        item_count: 1,
      });

    await ensureCartSessionReady();
    await expect(fetchCart()).resolves.toEqual({
      items: [
        {
          id: 1,
          product_id: 10,
          quantity: 1,
          product: {
            id: 10,
            name_zh: '吐司',
            name_en: 'Toast',
            price: 100,
            image_url: null,
            category_name_zh: '吐司',
            category_name_en: 'Toast',
          },
          line_total: 100,
        },
      ],
      subtotal: 100,
      shipping_fee: 60,
      total: 160,
      item_count: 1,
    });

    expect(authedFetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not mark the cart session ready when the bootstrap request fails', async () => {
    authedFetchFn.mockRejectedValueOnce(new Error('network error'));

    await expect(fetchCart()).resolves.toEqual({
      items: [],
      subtotal: 0,
      shipping_fee: 0,
      total: 0,
      item_count: 0,
    });

    authedFetchFn.mockResolvedValueOnce({
      items: [],
      subtotal: 0,
      shipping_fee: 0,
      total: 0,
      item_count: 0,
    });

    await expect(ensureCartSessionReady()).resolves.toBeUndefined();
    expect(authedFetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns immediately after markCartSessionReady is called', async () => {
    markCartSessionReady();

    await ensureCartSessionReady();

    expect(authedFetchFn).not.toHaveBeenCalled();
  });
});
