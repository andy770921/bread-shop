'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth-context';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import type { Order } from '@repo/shared';

interface LineSendResponse {
  success: boolean;
  needs_friend?: boolean;
  add_friend_url?: string;
}

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
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Authenticating...');
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
      setError('LINE login failed. Please return to the cart and try again.');
      return;
    }

    handleCallback(accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCallback(accessToken: string) {
    try {
      // Store token and refresh user
      localStorage.setItem('access_token', accessToken);
      window.history.replaceState(null, '', window.location.pathname);
      await refreshUser();

      // Check if there's saved form data (from cart LINE CTA flow)
      const formDataStr = localStorage.getItem('cart_form_data');
      if (!formDataStr) {
        // Normal LINE Login (not from cart flow) — redirect to return URL
        const returnUrl = localStorage.getItem('line_login_return_url') || '/';
        localStorage.removeItem('line_login_return_url');
        router.push(returnUrl);
        return;
      }

      // Auto-submit order using saved form data
      setStatusText('Creating your order...');
      const formData = JSON.parse(formDataStr);

      const orderData = await authedFetchFn<Order & { checkout_url?: string }>('api/orders', {
        method: 'POST',
        body: {
          customer_name: formData.customerName,
          customer_phone: formData.customerPhone,
          customer_email: formData.customerEmail || undefined,
          customer_address: formData.customerAddress,
          notes: formData.notes || undefined,
          payment_method: 'line',
          customer_line_id: formData.lineId || undefined,
          skip_cart_clear: true,
        },
      });

      // Send LINE message (best-effort — order is already created)
      setStatusText('Sending LINE notification...');
      try {
        await authedFetchFn<LineSendResponse>(`api/orders/${orderData.id}/line-send`, {
          method: 'POST',
        });
      } catch {
        // LINE message failed — not critical, order still exists
      }

      // Confirm order (clears cart)
      try {
        await authedFetchFn(`api/orders/${orderData.id}/confirm`, { method: 'POST' });
      } catch {
        // Cart clear failed — not critical
      }

      // Clean up and redirect to success
      localStorage.removeItem('cart_form_data');
      localStorage.removeItem('line_login_return_url');
      router.push(`/checkout/success?order=${orderData.order_number}`);
    } catch (err: any) {
      // Order creation failed — redirect to cart with error, preserve form data for retry
      localStorage.removeItem('line_login_return_url');
      // Keep cart_form_data so the cart page can restore form fields
      const msg = err?.message || 'Order creation failed. Please try again.';
      router.push(`/cart?error=${encodeURIComponent(msg)}`);
    }
  }

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
        <p style={{ color: 'var(--text-secondary)' }}>{statusText}</p>
      </div>
    </div>
  );
}
