'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth-context';

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // Prevent double-execution: refreshUser() triggers auth state change which
  // changes its own reference, causing useEffect to re-run. Without this guard,
  // the second run finds an empty hash (cleared by replaceState) and sets an error.
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;

    // Read tokens from URL hash fragment (serverless-safe flow).
    // Backend passes tokens in the hash so they're never sent to servers.
    const hash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);

    const hashError = hashParams.get('error');
    if (hashError) {
      processedRef.current = true;
      setError(hashError);
      return;
    }

    const accessToken = hashParams.get('access_token');
    if (accessToken) {
      processedRef.current = true;
      localStorage.setItem('access_token', accessToken);
      // Clear hash from URL to avoid token exposure in browser history
      window.history.replaceState(null, '', window.location.pathname);
      refreshUser().then(() => {
        const returnUrl = localStorage.getItem('line_login_return_url') || '/';
        localStorage.removeItem('line_login_return_url');
        router.push(returnUrl);
      });
      return;
    }

    // No hash tokens found — show error (do NOT auto-redirect)
    processedRef.current = true;
    setError('LINE login failed. Please return to the cart and try again.');
  }, [searchParams, router, refreshUser]);

  if (error) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: 'var(--bg-body)' }}
      >
        <div className="mx-4 max-w-md text-center">
          <p className="text-lg font-medium text-destructive">{error}</p>
          <button
            onClick={() => router.push('/cart')}
            className="mt-4 text-sm underline"
            style={{ color: 'var(--primary-500)' }}
          >
            Back to Cart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ backgroundColor: 'var(--bg-body)' }}
    >
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <p style={{ color: 'var(--text-secondary)' }}>Authenticating...</p>
      </div>
    </div>
  );
}
