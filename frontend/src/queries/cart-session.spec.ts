import {
  ensureCartSessionReady,
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

  let ensureQueryDataMock: jest.Mock;
  let mockQueryClient: { ensureQueryData: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    resetCartSessionReadyForTests();

    ensureQueryDataMock = jest.fn();
    mockQueryClient = { ensureQueryData: ensureQueryDataMock };
  });

  it('deduplicates via queryClient.ensureQueryData and caches the ready state', async () => {
    ensureQueryDataMock.mockResolvedValue({ items: [] });

    await ensureCartSessionReady(mockQueryClient as any);
    await ensureCartSessionReady(mockQueryClient as any);

    // First call goes through ensureQueryData, second short-circuits via cartSessionReady flag
    expect(ensureQueryDataMock).toHaveBeenCalledTimes(1);
  });

  it('returns immediately after markCartSessionReady is called', async () => {
    markCartSessionReady();
    await ensureCartSessionReady(mockQueryClient as any);

    expect(ensureQueryDataMock).not.toHaveBeenCalled();
  });

  it('starts the bootstrap in the background only once', async () => {
    let resolveEnsure: ((v: unknown) => void) | undefined;
    ensureQueryDataMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnsure = resolve;
        }),
    );

    primeCartSessionReady(mockQueryClient as any);
    primeCartSessionReady(mockQueryClient as any);

    expect(ensureQueryDataMock).toHaveBeenCalledTimes(1);

    resolveEnsure?.({ items: [] });
    await ensureCartSessionReady(mockQueryClient as any);

    expect(ensureQueryDataMock).toHaveBeenCalledTimes(1);
  });

  it('passes the correct queryKey and queryFn to ensureQueryData', async () => {
    authedFetchFn.mockResolvedValue({ items: [], subtotal: 0, shipping_fee: 0, total: 0 });
    ensureQueryDataMock.mockImplementation(async (opts: any) => opts.queryFn());

    await ensureCartSessionReady(mockQueryClient as any);

    expect(ensureQueryDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['cart'],
        queryFn: expect.any(Function),
      }),
    );
    expect(authedFetchFn).toHaveBeenCalledWith('api/cart');
  });

  it('queryFn returns EMPTY_CART on fetch error', async () => {
    authedFetchFn.mockRejectedValue(new Error('network error'));
    let capturedResult: unknown;
    ensureQueryDataMock.mockImplementation(async (opts: any) => {
      capturedResult = await opts.queryFn();
      return capturedResult;
    });

    await ensureCartSessionReady(mockQueryClient as any);

    expect(capturedResult).toEqual({
      items: [],
      subtotal: 0,
      shipping_fee: 0,
      total: 0,
      item_count: 0,
    });
  });
});
