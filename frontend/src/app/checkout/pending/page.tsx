'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Clock, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';
import { authTokenStore } from '@/lib/auth-token-store';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import { toast } from 'sonner';

interface PendingOrderData {
  cart: {
    items: {
      product_id: number;
      quantity: number;
      line_total: number;
      product: { name_zh: string; name_en: string; price: number };
    }[];
    subtotal: number;
    shipping_fee: number;
    total: number;
  } | null;
  customer: {
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    lineId?: string;
    notes?: string;
  };
}

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
  const { locale, t } = useLocale();
  const { refreshUser } = useAuth();
  const processedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderData, setOrderData] = useState<PendingOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const pendingId = searchParams.get('pendingId');
  const addFriendUrl = 'https://line.me/R/ti/p/@737nfsrc';

  // Store auth tokens from hash fragment, then fetch pending order details
  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const hash = window.location.hash.substring(1);
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      if (accessToken) {
        authTokenStore.set(accessToken);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        refreshUser();
      }
    }

    // Fetch pending order details to display
    if (pendingId) {
      authedFetchFn<PendingOrderData>(`api/auth/line/pending-order/${pendingId}`)
        .then(setOrderData)
        .catch(() => setFetchError(true))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
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
        router.push('/checkout/failed?reason=not_friend');
      } else {
        toast.error(message || t('checkout.orderSubmitFailed'));
        setSubmitting(false);
      }
    }
  };

  const cart = orderData?.cart;
  const customer = orderData?.customer;

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
      <Header />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        {/* Status Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--warning-500, #f59e0b)' }}
          >
            <Clock className="h-7 w-7 text-white" />
          </div>
          <h1
            className="font-heading mb-2 text-2xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('checkout.pendingTitle')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('checkout.pendingDesc')}
          </p>
        </div>

        {/* Order Details */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : fetchError ? (
          <div
            className="mb-6 rounded-xl border p-5 text-center text-sm"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-light)',
              color: 'var(--text-secondary)',
            }}
          >
            <p>{t('checkout.pendingLoadFailed')}</p>
            <Button
              variant="link"
              className="mt-2 text-sm"
              style={{ color: 'var(--primary-500)' }}
              onClick={() => router.push('/cart')}
            >
              {t('checkout.backToCart')}
            </Button>
          </div>
        ) : cart && cart.items.length > 0 ? (
          <div
            className="mb-6 rounded-xl border p-5"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
          >
            {/* Items */}
            <div className="space-y-3">
              {cart.items.map((item, i) => {
                const name = locale === 'zh' ? item.product.name_zh : item.product.name_en;
                return (
                  <div key={i} className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {name} x{item.quantity}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>NT${item.line_total}</span>
                  </div>
                );
              })}
            </div>

            <Separator className="my-3" />

            {/* Totals */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>{t('cart.subtotal')}</span>
                <span style={{ color: 'var(--text-primary)' }}>NT${cart.subtotal}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-secondary)' }}>{t('cart.shipping')}</span>
                <span
                  style={{
                    color: cart.shipping_fee === 0 ? 'var(--success-500)' : 'var(--text-primary)',
                  }}
                >
                  {cart.shipping_fee === 0 ? t('cart.freeShipping') : `NT$${cart.shipping_fee}`}
                </span>
              </div>
            </div>

            <Separator className="my-3" />

            <div className="flex justify-between font-semibold">
              <span style={{ color: 'var(--text-primary)' }}>{t('cart.total')}</span>
              <span style={{ color: 'var(--primary-700)' }}>NT${cart.total}</span>
            </div>

            {/* Customer Info */}
            {customer && (
              <>
                <Separator className="my-3" />
                <div className="space-y-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {customer.customerName && <p>{customer.customerName}</p>}
                  {customer.customerPhone && <p>{customer.customerPhone}</p>}
                  {customer.customerAddress && <p>{customer.customerAddress}</p>}
                  {customer.lineId && (
                    <p style={{ color: '#06C755' }}>LINE ID: {customer.lineId}</p>
                  )}
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
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
      </main>
      <Footer />
    </div>
  );
}
