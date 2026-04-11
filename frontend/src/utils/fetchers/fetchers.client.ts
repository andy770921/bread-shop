'use client';

import { fetchApi, streamingFetchApi } from './fetchers';
import { FetchOptions } from './fetchers.utils';

export const defaultFetchFn = async <TResponseData, TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<TResponseData> => {
  return fetchApi(`/${path}`, options);
};

export const authedFetchFn = async <TResponseData, TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<TResponseData> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return fetchApi(`/${path}`, {
    ...options,
    headers: { ...authHeaders, ...options?.headers },
  });
};

export const streamingFetchFn = async <TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<Response> => {
  return streamingFetchApi(`/${path}`, options);
};
