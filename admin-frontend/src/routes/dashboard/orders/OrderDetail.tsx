import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Send } from 'lucide-react';
import type { OrderStatus } from '@repo/shared';
import { ApiResponseError } from '@repo/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAdminOrder, useResendLine, useUpdateOrderStatus } from '@/queries/useAdminOrders';
import { useLocale } from '@/hooks/use-locale';

const STATUSES: OrderStatus[] = [
  'pending',
  'paid',
  'preparing',
  'shipping',
  'delivered',
  'cancelled',
];

export default function OrderDetail() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { id: idParam } = useParams();
  const id = idParam ? Number(idParam) : null;
  const { data: order, isLoading } = useAdminOrder(id);
  const updateStatus = useUpdateOrderStatus(id ?? 0);
  const resend = useResendLine(id ?? 0);

  if (isLoading || !order) {
    return <p className="text-text-secondary">{t('common.loading')}</p>;
  }

  async function handleStatusChange(next: string) {
    try {
      await updateStatus.mutateAsync(next as OrderStatus);
      toast.success(t('order.updateStatus'));
    } catch (err) {
      console.error(err);
      toast.error(t('common.error'));
    }
  }

  async function handleResend() {
    try {
      await resend.mutateAsync();
      toast.success(t('order.resendSuccess'));
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 409) {
        const body = err.body as { reason?: string };
        if (body?.reason === 'not_friend') {
          toast.error(t('order.resendFailedNotFriend'));
        } else {
          toast.error(t('order.resendFailedNoLine'));
        }
      } else {
        toast.error(t('common.error'));
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/orders')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('order.backToList')}
          </Button>
          <h1 className="font-serif text-2xl font-bold text-text-primary">{order.order_number}</h1>
        </div>
        <Button variant="outline" onClick={handleResend} disabled={resend.isPending}>
          <Send className="mr-2 h-4 w-4" />
          {resend.isPending ? t('order.resending') : t('order.resendLine')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{t('order.customer')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label={t('order.customer')} value={order.customer_name} />
            <InfoRow label={t('order.lineUserId')} value={order.customer_line_id ?? '—'} />
            <InfoRow label={t('order.notes')} value={order.notes ?? '—'} />
            <InfoRow label={t('order.paymentMethod')} value={order.payment_method ?? '—'} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t('order.detail')}</CardTitle>
            <Select value={order.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`order.status${capitalize(s)}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('order.items')}</TableHead>
                  <TableHead className="text-right">{t('order.quantity')}</TableHead>
                  <TableHead className="text-right">{t('order.unitPrice')}</TableHead>
                  <TableHead className="text-right">{t('order.subtotal')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.product_name_zh}</TableCell>
                    <TableCell className="text-right">{it.quantity}</TableCell>
                    <TableCell className="text-right">NT${it.product_price}</TableCell>
                    <TableCell className="text-right">NT${it.subtotal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="space-y-1 border-t border-border-light pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">{t('order.subtotal')}</span>
                <span>NT${order.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">{t('order.shippingFee')}</span>
                <span>NT${order.shipping_fee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 text-base font-bold">
                <span>{t('order.total')}</span>
                <span className="text-primary-700">NT${order.total.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right text-text-primary">{value}</span>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
