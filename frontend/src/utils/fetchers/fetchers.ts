import { FetchOptions, getFetchQueryOptions, parseErrorBody } from './fetchers.utils';
import { ApiResponseError } from './fetchers.error';
import { HTTP_STATUS_CODE } from '@/constants/common';

const REQUEST_TIMEOUT = 100000;

export const fetchApi = async <TResponseData, TRequestBody = unknown, TErrorBody = unknown>(
  url: string,
  options: FetchOptions<TRequestBody> = {},
): Promise<TResponseData> => {
  const processResponse = async (response: Response) => {
    const returnHeaders = options.returnHeaders ?? false;
    const res = response.ok
      ? (options.isJSONResponse ?? true)
        ? response.json()
        : response.text()
      : parseErrorBody<TErrorBody>(response);
    if (!returnHeaders) {
      return res;
    }

    const data = await res;
    return {
      data,
      headers: Object.fromEntries(response.headers),
      status: response.status,
      statusText: response.statusText,
    };
  };

  const timeout = options.timeout ?? REQUEST_TIMEOUT;
  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), timeout);

  try {
    const rawResponse = await fetch(url, {
      ...getFetchQueryOptions(options),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (rawResponse.status === 204) {
      return undefined as TResponseData;
    }

    const response: TResponseData | TErrorBody = await processResponse(rawResponse);
    if (rawResponse.ok) {
      return response as TResponseData;
    }

    throw new ApiResponseError(rawResponse, response as TErrorBody);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      const message = 'Request timeout';
      const timeoutResponse = {
        status: HTTP_STATUS_CODE.REQUEST_TIMEOUT,
        statusText: message,
      } as Response;
      throw new ApiResponseError(timeoutResponse, { error: { message } }, message);
    }
    throw error;
  }
};

// Streaming version of fetchApi that returns raw Response for streaming use cases
export const streamingFetchApi = async <TRequestBody = unknown, TErrorBody = unknown>(
  url: string,
  options: FetchOptions<TRequestBody> = {},
): Promise<Response> => {
  const timeout = options.timeout ?? REQUEST_TIMEOUT;
  const controller = new AbortController();
  const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), timeout);

  try {
    const rawResponse = await fetch(url, {
      ...getFetchQueryOptions(options),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!rawResponse.ok) {
      const errorBody = await parseErrorBody<TErrorBody>(rawResponse);
      throw new ApiResponseError(rawResponse, errorBody);
    }

    return rawResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      const message = 'Request timeout';
      const timeoutResponse = {
        status: HTTP_STATUS_CODE.REQUEST_TIMEOUT,
        statusText: message,
      } as Response;
      throw new ApiResponseError(timeoutResponse, { error: { message } }, message);
    }
    throw error;
  }
};
