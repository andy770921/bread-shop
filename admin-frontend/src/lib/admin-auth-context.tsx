import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminMe } from '@repo/shared';
import { adminTokenStore } from './admin-token-store';
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

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await defaultFetchFn<
        { access_token: string },
        { email: string; password: string }
      >('api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      adminTokenStore.set(access_token);
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
