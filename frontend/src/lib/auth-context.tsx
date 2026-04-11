'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MeResponse } from '@repo/shared';
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
      localStorage.removeItem('access_token');
      setToken(null);
      setIsLoading(false);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => defaultFetchFn('api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      localStorage.removeItem('access_token');
      setToken(null);
      setUser(null);
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    if (stored) {
      setToken(stored);
      fetchUserMutation.mutate(stored);
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await defaultFetchFn<{ access_token: string }>('api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      localStorage.setItem('access_token', data.access_token);
      setToken(data.access_token);
      await fetchUserMutation.mutateAsync(data.access_token);
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    [fetchUserMutation, queryClient],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const data = await defaultFetchFn<{ access_token: string }>('api/auth/register', {
        method: 'POST',
        body: { email, password, name },
      });
      localStorage.setItem('access_token', data.access_token);
      setToken(data.access_token);
      await fetchUserMutation.mutateAsync(data.access_token);
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    [fetchUserMutation, queryClient],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const refreshUser = useCallback(async () => {
    const stored = localStorage.getItem('access_token');
    if (stored) await fetchUserMutation.mutateAsync(stored);
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
