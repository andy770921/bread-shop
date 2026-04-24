import { fetchApi, ApiResponseError } from '@repo/shared';
import type { FetchOptions } from '@repo/shared';
import { adminTokenStore } from './admin-token-store';

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

if (!API_BASE_URL) {
  throw new Error(
    'VITE_API_URL is not set. Create admin-frontend/.env.local with VITE_API_URL=http://localhost:3000 for dev, or set it in Vercel for production.',
  );
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = adminTokenStore.getRefresh();
  if (!refreshToken) return null;

  try {
    const data = await fetchApi<{ access_token: string; refresh_token: string }>(
      `${API_BASE_URL}/api/auth/refresh`,
      { method: 'POST', body: { refresh_token: refreshToken } },
    );
    adminTokenStore.set(data.access_token);
    adminTokenStore.setRefresh(data.refresh_token);
    return data.access_token;
  } catch {
    adminTokenStore.clear();
    return null;
  }
}

export const defaultFetchFn = async <TResponseData, TRequestBody = unknown>(
  path: string,
  options?: FetchOptions<TRequestBody>,
): Promise<TResponseData> => {
  const token = adminTokenStore.get();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${suffix}`;

  try {
    return await fetchApi<TResponseData, TRequestBody>(url, {
      ...options,
      headers: { ...authHeaders, ...options?.headers },
    });
  } catch (err) {
    if (!(err instanceof ApiResponseError) || err.status !== 401) throw err;

    // Deduplicate concurrent refresh calls
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    if (!newToken) throw err;

    // Retry with the new token
    return fetchApi<TResponseData, TRequestBody>(url, {
      ...options,
      headers: { ...options?.headers, Authorization: `Bearer ${newToken}` },
    });
  }
};
