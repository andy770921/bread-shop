import { fetchApi } from '@repo/shared';
import type { FetchOptions } from '@repo/shared';
import { adminTokenStore } from './admin-token-store';

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

if (!API_BASE_URL) {
  throw new Error(
    'VITE_API_URL is not set. Create admin-frontend/.env.local with VITE_API_URL=http://localhost:3000 for dev, or set it in Vercel for production.',
  );
}

export const defaultFetchFn = async <TResponseData, TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<TResponseData> => {
  const token = adminTokenStore.get();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return fetchApi<TResponseData, TRequestBody>(`${API_BASE_URL}${suffix}`, {
    ...options,
    headers: { ...authHeaders, ...options?.headers },
  });
};
