import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminMe } from '@repo/shared';
import { ADMIN_TOKEN_CLEAR_EVENT, adminTokenStore } from './admin-token-store';
import { defaultFetchFn } from './admin-fetchers';

type Ctx = {
  user: AdminMe | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AdminAuthContext = createContext<Ctx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = adminTokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    defaultFetchFn<AdminMe>('api/admin/me')
      .then(setUser)
      .catch(() => adminTokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  // Reset user state whenever tokens are cleared — including implicit clears
  // from a failed token refresh inside the fetcher interceptor. Without this,
  // the guard would not redirect because `user` stays set while storage is empty.
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener(ADMIN_TOKEN_CLEAR_EVENT, handler);
    return () => window.removeEventListener(ADMIN_TOKEN_CLEAR_EVENT, handler);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token, refresh_token } = await defaultFetchFn<
        { access_token: string; refresh_token: string },
        { email: string; password: string }
      >('api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      adminTokenStore.set(access_token);
      adminTokenStore.setRefresh(refresh_token);
      try {
        const me = await defaultFetchFn<AdminMe>('api/admin/me');
        setUser(me);
        navigate('/dashboard');
      } catch (err) {
        adminTokenStore.clear();
        throw err;
      }
    },
    [navigate],
  );

  const logout = useCallback(() => {
    adminTokenStore.clear();
    setUser(null);
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <AdminAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth outside provider');
  return ctx;
};
