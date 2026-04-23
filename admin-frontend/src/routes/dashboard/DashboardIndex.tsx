import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdminDashboard } from '@/queries/useAdminDashboard';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/10 text-[color:var(--warning-500)]',
  paid: 'bg-primary-100 text-primary-700',
  preparing: 'bg-primary-100 text-primary-700',
  shipping: 'bg-primary-500/15 text-primary-700',
  delivered: 'bg-success/10 text-[color:var(--success-500)]',
  cancelled: 'bg-error/10 text-error',
};

export default function DashboardIndex() {
  const { t } = useLocale();
  const { data, isLoading } = useAdminDashboard();

  if (isLoading || !data) {
    return <p className="text-text-secondary">{t('common.loading')}</p>;
  }

  const kpi = [
    { label: t('dashboard.todayOrders'), value: data.todayOrderCount },
    {
      label: t('dashboard.todayRevenue'),
      value: `NT$${data.todayRevenue.toLocaleString()}`,
    },
    { label: t('dashboard.pendingOrders'), value: data.pendingOrderCount },
  ];

  const maxTop = Math.max(...data.topProducts.map((p) => Number(p.total_quantity)), 1);

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="font-serif text-xl font-bold text-text-primary md:text-2xl">
        {t('dashboard.title')}
      </h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        {kpi.map((k) => (
          <Card key={k.label} className="shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-secondary">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-serif text-2xl font-bold text-primary-700 md:text-3xl">
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">{t('dashboard.recentOrders')}</CardTitle>
            <Link
              to="/dashboard/orders"
              className="shrink-0 text-sm text-primary-600 hover:text-primary-700"
            >
              {t('dashboard.viewAll')}
            </Link>
          </CardHeader>
          <CardContent className="md:px-6">
            {data.recentOrders.length === 0 ? (
              <p className="text-sm text-text-secondary">{t('dashboard.noOrders')}</p>
            ) : (
              <>
                {/* Desktop table */}
                <Table className="hidden md:table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('order.orderNumber')}</TableHead>
                      <TableHead>{t('order.customer')}</TableHead>
                      <TableHead className="text-right">{t('order.total')}</TableHead>
                      <TableHead>{t('order.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>
                          <Link
                            to={`/dashboard/orders/${o.id}`}
                            className="text-primary-600 hover:underline"
                          >
                            {o.order_number}
                          </Link>
                        </TableCell>
                        <TableCell>{o.customer_name}</TableCell>
                        <TableCell className="text-right">
                          NT${o.total.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn(STATUS_COLORS[o.status] ?? '')}
                          >
                            {t(`order.status${capitalize(o.status)}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Mobile list */}
                <div className="flex flex-col divide-y divide-border-light md:hidden">
                  {data.recentOrders.map((o) => (
                    <Link
                      key={o.id}
                      to={`/dashboard/orders/${o.id}`}
                      className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-primary-600">
                          {o.order_number}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn('shrink-0', STATUS_COLORS[o.status] ?? '')}
                        >
                          {t(`order.status${capitalize(o.status)}`)}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-text-primary">{o.customer_name}</span>
                        <span className="shrink-0 text-text-primary">
                          NT${o.total.toLocaleString()}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.topProducts')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topProducts.length === 0 ? (
              <p className="text-sm text-text-secondary">{t('dashboard.noData')}</p>
            ) : (
              data.topProducts.map((p) => {
                const pct = Math.round((Number(p.total_quantity) / maxTop) * 100);
                return (
                  <div key={p.product_id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-text-primary">{p.name_zh}</span>
                      <span className="shrink-0 text-text-secondary">{p.total_quantity}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dashboard.ordersByStatus')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          {Object.entries(data.ordersByStatus).map(([status, count]) => (
            <div
              key={status}
              className="rounded-md border border-border-light bg-bg-elevated px-4 py-3 sm:min-w-[120px]"
            >
              <p className="text-xs text-text-secondary">
                {t(`order.status${capitalize(status)}`)}
              </p>
              <p className="font-serif text-xl font-bold text-text-primary">{count}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
