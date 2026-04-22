import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from './admin-auth-context';

export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/', { replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) return null;
  return <>{children}</>;
}
