'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useLocale } from '@/hooks/use-locale';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useOrders } from '@/queries/use-orders';
import { getStatusColor } from '@/utils/order';

export default function OrdersPage() {
  const { locale, t } = useLocale();
  const { user, isLoading: authLoading } = useAuthGuard();

  const { data, isLoading } = useOrders(!!user);

  const orders = data?.orders ?? [];

  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
        <Header />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
          <Skeleton className="mb-6 h-8 w-40" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1
          className="font-heading mb-8 text-2xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('orders.title')}
        </h1>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <Package className="h-12 w-12" style={{ color: 'var(--neutral-400)' }} />
            <p style={{ color: 'var(--text-secondary)' }}>{t('orders.empty')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className="block">
                <div
                  className="flex items-center justify-between rounded-xl border p-4 transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-light)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {t('orders.orderNumber')}: {order.order_number}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(order.created_at).toLocaleDateString(
                        locale === 'zh' ? 'zh-TW' : 'en-US',
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      className="rounded-md px-2 py-0.5 text-xs"
                      style={getStatusColor(order.status)}
                    >
                      {t(`status.${order.status}`)}
                    </Badge>
                    <span className="text-sm font-semibold" style={{ color: 'var(--primary-700)' }}>
                      NT${order.total}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
