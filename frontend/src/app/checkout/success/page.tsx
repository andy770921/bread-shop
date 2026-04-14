'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';
import { authTokenStore } from '@/lib/auth-token-store';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/queries/query-keys';

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const processedRef = useRef(false);
  const orderNumber = searchParams.get('order') || searchParams.get('order_id');

  // Store auth tokens from hash fragment (set by server-side LINE order flow)
  // and invalidate stale cart cache so header badge shows 0 items.
  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cart });

    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token');
    if (accessToken) {
      authTokenStore.set(accessToken);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      refreshUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
      <Header />
      <main className="flex flex-1 items-center justify-center px-4 py-24">
        <div className="flex max-w-md flex-col items-center text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--success-500)' }}
          >
            <CheckCircle className="h-8 w-8 text-white" />
          </div>

          <h1
            className="font-heading mb-4 text-3xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('checkout.successTitle')}
          </h1>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            {t('checkout.successDesc')}
          </p>

          {orderNumber && (
            <p className="mb-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {t('orders.orderNumber')}: #{orderNumber}
            </p>
          )}

          <div className="flex gap-4">
            <Link href="/">
              <Button
                size="lg"
                className="rounded-full px-8"
                style={{ backgroundColor: 'var(--primary-500)', color: '#fff' }}
              >
                {t('checkout.backHome')}
              </Button>
            </Link>
            {orderNumber && (
              <Link href="/orders">
                <Button variant="outline" size="lg" className="rounded-full px-8">
                  {t('orders.title')}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
