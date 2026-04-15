import { fetchContactDraft } from './use-cart-contact-draft';
import { ApiResponseError } from '@/utils/fetchers/fetchers.error';

jest.mock('./cart-session', () => ({
  ensureCartSessionReady: jest.fn(),
}));

jest.mock('@/utils/fetchers/fetchers.client', () => ({
  authedFetchFn: jest.fn(),
}));

describe('[use-cart-contact-draft]', () => {
  const { ensureCartSessionReady } = jest.requireMock('./cart-session') as {
    ensureCartSessionReady: jest.Mock;
  };
  const { authedFetchFn } = jest.requireMock('@/utils/fetchers/fetchers.client') as {
    authedFetchFn: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ensureCartSessionReady.mockResolvedValue(undefined);
  });

  it('treats a missing draft endpoint as no saved draft', async () => {
    authedFetchFn.mockRejectedValue(
      new ApiResponseError({ status: 404, statusText: 'Not Found' } as Response, ''),
    );

    await expect(fetchContactDraft()).resolves.toBeNull();
    expect(ensureCartSessionReady).toHaveBeenCalled();
    expect(authedFetchFn).toHaveBeenCalledWith('api/cart/contact-draft');
  });

  it('treats an empty successful response as no saved draft', async () => {
    authedFetchFn.mockResolvedValue(undefined);

    await expect(fetchContactDraft()).resolves.toBeNull();
  });

  it('rethrows non-404 errors', async () => {
    const error = new ApiResponseError(
      { status: 500, statusText: 'Internal Server Error' } as Response,
      { message: 'boom' },
    );
    authedFetchFn.mockRejectedValue(error);

    await expect(fetchContactDraft()).rejects.toBe(error);
  });
});
