import { fetchApi } from './fetchers';
import { ApiResponseError } from './fetchers.error';

describe('[fetchers] fetchApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps non-ok empty responses as ApiResponseError instead of leaking a SyntaxError', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: {
        get: jest.fn().mockReturnValue(null),
      },
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);

    await expect(fetchApi('/api/cart/contact-draft')).rejects.toEqual(
      expect.objectContaining<ApiResponseError>({
        name: 'ApiResponseError',
        status: 404,
        statusText: 'Not Found',
        body: '',
      }),
    );
  });
});
