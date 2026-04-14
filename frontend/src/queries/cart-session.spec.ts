import {
  ensureCartSessionReady,
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

  it('deduplicates concurrent bootstrap requests and reuses the ready state', async () => {
    let resolveFetch: (() => void) | undefined;
    authedFetchFn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = ensureCartSessionReady();
    const second = ensureCartSessionReady();

    expect(authedFetchFn).toHaveBeenCalledTimes(1);
    resolveFetch?.();

    await Promise.all([first, second]);
    await ensureCartSessionReady();

    expect(authedFetchFn).toHaveBeenCalledTimes(1);
    expect(authedFetchFn).toHaveBeenCalledWith('api/cart');
  });

  it('allows retrying after a failed bootstrap request', async () => {
    authedFetchFn.mockRejectedValueOnce(new Error('bootstrap failed'));
    authedFetchFn.mockResolvedValueOnce({ items: [] });

    await expect(ensureCartSessionReady()).rejects.toThrow('bootstrap failed');
    await expect(ensureCartSessionReady()).resolves.toBeUndefined();

    expect(authedFetchFn).toHaveBeenCalledTimes(2);
  });

  it('starts the bootstrap in the background only once', async () => {
    let resolveFetch: (() => void) | undefined;
    authedFetchFn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    primeCartSessionReady();
    primeCartSessionReady();

    expect(authedFetchFn).toHaveBeenCalledTimes(1);

    resolveFetch?.();
    await ensureCartSessionReady();

    expect(authedFetchFn).toHaveBeenCalledTimes(1);
  });
});
