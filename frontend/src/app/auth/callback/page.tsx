'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth-context';

const API_URL = '';

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('No authorization code provided');
      return;
    }

    async function exchangeCode(authCode: string) {
      try {
        const res = await fetch(`${API_URL}/api/auth/line/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code: authCode }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Failed to exchange code');
        }

        const data = await res.json();
        localStorage.setItem('access_token', data.access_token);
        await refreshUser();
        router.push('/');
      } catch (err: any) {
        setError(err.message || 'Authentication failed');
      }
    }

    exchangeCode(code);
  }, [searchParams, router, refreshUser]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-body)' }}>
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">{error}</p>
          <button
            onClick={() => router.push('/auth/login')}
            className="mt-4 text-sm underline"
            style={{ color: 'var(--primary-500)' }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-body)' }}>
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <p style={{ color: 'var(--text-secondary)' }}>Authenticating...</p>
      </div>
    </div>
  );
}
