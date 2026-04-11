'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';

const API_URL = '';

export default function LoginPage() {
  const { t } = useLocale();
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success(t('auth.login'));
      router.push('/');
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLineLogin = () => {
    window.location.href = `${API_URL}/api/auth/line`;
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
      <Header />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div
          className="w-full max-w-md space-y-6 rounded-2xl border p-8"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-light)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div className="text-center">
            <h1
              className="font-heading text-2xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('auth.login')}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.email')}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.password')}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full rounded-full"
              size="lg"
              style={{ backgroundColor: 'var(--primary-500)', color: '#fff' }}
              disabled={loading}
            >
              {loading ? '...' : t('auth.login')}
            </Button>
          </form>

          <Separator />

          <Button
            variant="outline"
            className="w-full gap-2 rounded-full"
            size="lg"
            style={{ borderColor: '#06C755', color: '#06C755' }}
            onClick={handleLineLogin}
          >
            {t('auth.loginWithLine')}
          </Button>

          <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('auth.noAccount')}{' '}
            <Link
              href="/auth/register"
              className="font-medium underline"
              style={{ color: 'var(--primary-500)' }}
            >
              {t('auth.register')}
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
