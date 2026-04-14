'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MeResponse } from '@repo/shared';
import { authTokenStore } from './auth-token-store';
import { invalidateAuthQueries } from '@/queries/query-keys';
import { defaultFetchFn } from '@/utils/fetchers/fetchers.client';

interface AuthContextType {
  user: MeResponse | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuthState = useCallback(() => {
    authTokenStore.clear();
    setToken(null);
    setUser(null);
  }, []);

  const fetchUserMutation = useMutation({
    mutationFn: (accessToken: string) =>
      defaultFetchFn<MeResponse>('api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    onSuccess: (data) => {
      setUser(data);
      setIsLoading(false);
    },
    onError: () => {
      clearAuthState();
      setIsLoading(false);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => defaultFetchFn('api/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      clearAuthState();
      await invalidateAuthQueries(queryClient);
    },
  });

  useEffect(() => {
    const storedToken = authTokenStore.get();
    if (storedToken) {
      setToken(storedToken);
      fetchUserMutation.mutate(storedToken);
      return;
    }

    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await defaultFetchFn<{ access_token: string }>('api/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      authTokenStore.set(data.access_token);
      setToken(data.access_token);
      await fetchUserMutation.mutateAsync(data.access_token);
      await invalidateAuthQueries(queryClient);
    },
    [fetchUserMutation, queryClient],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const data = await defaultFetchFn<{ access_token: string }>('api/auth/register', {
        method: 'POST',
        body: { email, password, name },
      });

      authTokenStore.set(data.access_token);
      setToken(data.access_token);
      await fetchUserMutation.mutateAsync(data.access_token);
      await invalidateAuthQueries(queryClient);
    },
    [fetchUserMutation, queryClient],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const refreshUser = useCallback(async () => {
    const storedToken = authTokenStore.get();
    if (!storedToken) {
      setUser(null);
      setToken(null);
      return;
    }

    setToken(storedToken);
    await fetchUserMutation.mutateAsync(storedToken);
  }, [fetchUserMutation]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
