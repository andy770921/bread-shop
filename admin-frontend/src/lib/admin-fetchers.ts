import { fetchApi } from '@repo/shared';
import type { FetchOptions } from '@repo/shared';
import { adminTokenStore } from './admin-token-store';

export const defaultFetchFn = async <TResponseData, TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<TResponseData> => {
  const token = adminTokenStore.get();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const url = path.startsWith('/') ? path : `/${path}`;
  return fetchApi<TResponseData, TRequestBody>(url, {
    ...options,
    headers: { ...authHeaders, ...options?.headers },
  });
};
