'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Clock, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import { toast } from 'sonner';

export default function CheckoutPendingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <PendingContent />
    </Suspense>
  );
}

function PendingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useLocale();
  const { refreshUser } = useAuth();
  const processedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const pendingId = searchParams.get('pendingId');
  const addFriendUrl = 'https://line.me/R/ti/p/@737nfsrc';

  // Store auth tokens from hash fragment (set by backend callback)
  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token');
    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      refreshUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!pendingId || submitting) return;
    setSubmitting(true);

    try {
      const data = await authedFetchFn<{ success: boolean; order_number: string | null }>(
        'api/auth/line/confirm-order',
        { method: 'POST', body: { pendingId } },
      );
      if (data.order_number) {
        router.push(`/checkout/success?order=${data.order_number}`);
      } else {
        router.push('/checkout/success');
      }
    } catch (err: any) {
      const msg = err?.body?.message;
      const message = Array.isArray(msg) ? msg[0] : msg || '';

      if (message === 'not_friend') {
        // Still not friends — redirect to failure page
        router.push('/checkout/failed?reason=not_friend');
      } else {
        toast.error(message || t('checkout.orderSubmitFailed'));
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
      <Header />
      <main className="flex flex-1 items-center justify-center px-4 py-24">
        <div className="flex max-w-md flex-col items-center text-center">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--warning-500, #f59e0b)' }}
          >
            <Clock className="h-8 w-8 text-white" />
          </div>

          <h1
            className="font-heading mb-4 text-3xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('checkout.pendingTitle')}
          </h1>
          <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
            {t('checkout.pendingDesc')}
          </p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <a href={addFriendUrl} target="_blank" rel="noopener noreferrer">
              <Button
                size="lg"
                className="w-full gap-2 rounded-full"
                style={{ backgroundColor: '#06C755', color: '#fff' }}
              >
                <UserPlus className="h-4 w-4" />
                {t('checkout.addFriend')}
              </Button>
            </a>

            <Button
              size="lg"
              className="w-full rounded-full"
              style={{ backgroundColor: 'var(--primary-500)', color: '#fff' }}
              onClick={handleSubmit}
              disabled={submitting || !pendingId}
            >
              {submitting ? t('checkout.submitting') : t('checkout.submitOrder')}
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
