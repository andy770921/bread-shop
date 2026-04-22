import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdminOrders } from '@/queries/useAdminOrders';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';

const STATUSES = ['pending', 'paid', 'preparing', 'shipping', 'delivered', 'cancelled'] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/10 text-[color:var(--warning-500)]',
  paid: 'bg-primary-100 text-primary-700',
  preparing: 'bg-primary-100 text-primary-700',
  shipping: 'bg-primary-500/15 text-primary-700',
  delivered: 'bg-success/10 text-[color:var(--success-500)]',
  cancelled: 'bg-error/10 text-error',
};

export default function OrderList() {
  const { t } = useLocale();
  const [status, setStatus] = useState<string>('all');
  const { data, isLoading } = useAdminOrders(status === 'all' ? undefined : status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-text-primary">{t('order.title')}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">{t('order.filterStatus')}</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('order.filterAll')}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`order.status${capitalize(s)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-text-secondary">{t('common.loading')}</p>
          ) : !data?.orders.length ? (
            <p className="p-6 text-text-secondary">{t('order.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('order.orderNumber')}</TableHead>
                  <TableHead>{t('order.customer')}</TableHead>
                  <TableHead className="text-right">{t('order.total')}</TableHead>
                  <TableHead>{t('order.status')}</TableHead>
                  <TableHead>{t('order.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orders.map((o) => (
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
                    <TableCell className="text-right">NT${o.total.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn(STATUS_COLORS[o.status] ?? '')}>
                        {t(`order.status${capitalize(o.status)}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-text-secondary">
                      {new Date(o.created_at).toLocaleString('zh-TW')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
