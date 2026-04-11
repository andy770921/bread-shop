'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MeResponse } from '@repo/shared';

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

const API_URL = '';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    if (stored) {
      setToken(stored);
      fetchUser(stored);
    } else {
      setIsLoading(false);
    }
  }, []);

  async function fetchUser(accessToken: string) {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (res.ok) {
        setUser(await res.json());
      } else {
        localStorage.removeItem('access_token');
        setToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    setToken(data.access_token);
    await fetchUser(data.access_token);
    // Refetch cart after login (session merge may have changed cart)
    queryClient.invalidateQueries({ queryKey: ['cart'] });
  }

  async function register(email: string, password: string, name?: string) {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    setToken(data.access_token);
    await fetchUser(data.access_token);
    queryClient.invalidateQueries({ queryKey: ['cart'] });
  }

  async function logout() {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    localStorage.removeItem('access_token');
    setToken(null);
    setUser(null);
    queryClient.invalidateQueries({ queryKey: ['cart'] });
  }

  async function refreshUser() {
    const stored = localStorage.getItem('access_token');
    if (stored) await fetchUser(stored);
  }

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
