'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';
import type { Order, OrderStatus } from '@repo/shared';

const API_URL = '';

const statusSteps: OrderStatus[] = ['pending', 'paid', 'preparing', 'shipping', 'delivered'];

function getStatusColor(status: OrderStatus): React.CSSProperties {
  switch (status) {
    case 'pending':
      return { backgroundColor: '#FEF3C7', color: '#92400E' };
    case 'paid':
      return { backgroundColor: '#D1FAE5', color: '#065F46' };
    case 'preparing':
      return { backgroundColor: '#DBEAFE', color: '#1E40AF' };
    case 'shipping':
      return { backgroundColor: '#E0E7FF', color: '#3730A3' };
    case 'delivered':
      return { backgroundColor: '#D1FAE5', color: '#065F46' };
    case 'cancelled':
      return { backgroundColor: '#FEE2E2', color: '#991B1B' };
    default:
      return {};
  }
}

export default function OrderDetailPage() {
  const params = useParams();
  const { locale, t } = useLocale();
  const { user, token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const orderId = params.id as string;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [authLoading, user, router]);

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/orders/${orderId}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch order');
      return res.json();
    },
    enabled: !!user && !!orderId,
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
        <Header />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
          <Skeleton className="mb-6 h-8 w-60" />
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-60 w-full rounded-xl" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) return null;

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <p style={{ color: 'var(--text-secondary)' }}>Order not found</p>
        </main>
        <Footer />
      </div>
    );
  }

  const currentStepIndex =
    order.status === 'cancelled' ? -1 : statusSteps.indexOf(order.status);

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        {/* Back link */}
        <Link href="/orders">
          <Button variant="ghost" size="sm" className="mb-6 gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t('orders.title')}
          </Button>
        </Link>

        {/* Order Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1
              className="font-heading text-2xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('orders.orderNumber')}: {order.order_number}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {new Date(order.created_at).toLocaleDateString(locale === 'zh' ? 'zh-TW' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <Badge
            className="rounded-md px-3 py-1 text-sm"
            style={getStatusColor(order.status)}
          >
            {t(`status.${order.status}`)}
          </Badge>
        </div>

        {/* Status Timeline */}
        {order.status !== 'cancelled' && (
          <div className="mb-10 flex items-center justify-between">
            {statusSteps.map((step, i) => (
              <div key={step} className="flex flex-1 items-center">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                  style={
                    i <= currentStepIndex
                      ? { backgroundColor: 'var(--primary-500)', color: '#fff' }
                      : { backgroundColor: 'var(--neutral-200)', color: 'var(--text-tertiary)' }
                  }
                >
                  {i + 1}
                </div>
                {i < statusSteps.length - 1 && (
                  <div
                    className="mx-1 h-0.5 flex-1"
                    style={{
                      backgroundColor:
                        i < currentStepIndex ? 'var(--primary-500)' : 'var(--neutral-200)',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Items Table */}
        <div
          className="mb-6 overflow-hidden rounded-xl border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-light)',
          }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <th
                  className="px-4 py-3 text-left text-xs font-medium uppercase"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {locale === 'zh' ? '商品' : 'Product'}
                </th>
                <th
                  className="px-4 py-3 text-center text-xs font-medium uppercase"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {locale === 'zh' ? '單價' : 'Price'}
                </th>
                <th
                  className="px-4 py-3 text-center text-xs font-medium uppercase"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {locale === 'zh' ? '數量' : 'Qty'}
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium uppercase"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {locale === 'zh' ? '小計' : 'Subtotal'}
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t"
                  style={{ borderColor: 'var(--border-light)' }}
                >
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {locale === 'zh' ? item.product_name_zh : item.product_name_en}
                  </td>
                  <td
                    className="px-4 py-3 text-center text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    NT${item.product_price}
                  </td>
                  <td
                    className="px-4 py-3 text-center text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {item.quantity}
                  </td>
                  <td
                    className="px-4 py-3 text-right text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    NT${item.subtotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div
          className="mb-6 rounded-xl border p-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-light)',
          }}
        >
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>{t('cart.subtotal')}</span>
              <span style={{ color: 'var(--text-primary)' }}>NT${order.subtotal}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>{t('cart.shipping')}</span>
              <span
                style={{
                  color: order.shipping_fee === 0 ? 'var(--success-500)' : 'var(--text-primary)',
                }}
              >
                {order.shipping_fee === 0 ? t('cart.freeShipping') : `NT$${order.shipping_fee}`}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span
                className="font-heading text-lg font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('cart.total')}
              </span>
              <span
                className="font-heading text-lg font-bold"
                style={{ color: 'var(--primary-700)' }}
              >
                NT${order.total}
              </span>
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div
          className="rounded-xl border p-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-light)',
          }}
        >
          <h2
            className="font-heading mb-3 text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('cart.customerInfo')}
          </h2>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>{t('cart.name')}: </span>
              <span style={{ color: 'var(--text-primary)' }}>{order.customer_name}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>{t('cart.phone')}: </span>
              <span style={{ color: 'var(--text-primary)' }}>{order.customer_phone}</span>
            </div>
            {order.customer_email && (
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>{t('cart.email')}: </span>
                <span style={{ color: 'var(--text-primary)' }}>{order.customer_email}</span>
              </div>
            )}
            <div>
              <span style={{ color: 'var(--text-tertiary)' }}>{t('cart.address')}: </span>
              <span style={{ color: 'var(--text-primary)' }}>{order.customer_address}</span>
            </div>
            {order.notes && (
              <div className="sm:col-span-2">
                <span style={{ color: 'var(--text-tertiary)' }}>{t('cart.notes')}: </span>
                <span style={{ color: 'var(--text-primary)' }}>{order.notes}</span>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
