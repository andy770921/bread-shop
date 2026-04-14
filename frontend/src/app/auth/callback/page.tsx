'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth-context';
import { authTokenStore } from '@/lib/auth-token-store';

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

/**
 * Handles LINE Login callback for non-cart flows (e.g., login page).
 *
 * For the cart LINE CTA flow, the backend callback creates the order server-side
 * and redirects directly to /checkout/success — this page is never reached.
 * This page only handles the case where LINE Login was initiated without a pending order.
 */
function CallbackContent() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const hash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);

    const hashError = hashParams.get('error');
    if (hashError) {
      setError(hashError);
      return;
    }

    const accessToken = hashParams.get('access_token');
    if (!accessToken) {
      setError('LINE login failed. Please try again.');
      return;
    }

    // Store token and redirect
    authTokenStore.set(accessToken);
    window.history.replaceState(null, '', window.location.pathname);
    refreshUser().then(() => {
      authTokenStore.set(accessToken); // Re-store after potential onError
      router.push('/');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: 'var(--bg-body)' }}
      >
        <div className="mx-4 max-w-md text-center">
          <p className="text-lg font-medium text-destructive">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 text-sm underline"
            style={{ color: 'var(--primary-500)' }}
          >
            Back to Home
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
