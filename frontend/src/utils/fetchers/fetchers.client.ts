'use client';

import { fetchApi, streamingFetchApi } from './fetchers';
import { FetchOptions } from './fetchers.utils';

export const defaultFetchFn = async <TResponseData, TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<TResponseData> => {
  return fetchApi(`/${path}`, options);
};

export const streamingFetchFn = async <TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<Response> => {
  return streamingFetchApi(`/${path}`, options);
};
