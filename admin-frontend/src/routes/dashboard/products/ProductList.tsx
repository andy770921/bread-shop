import { Link } from 'react-router-dom';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ApiResponseError } from '@repo/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useAdminProducts, useDeleteProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';

export default function ProductList() {
  const { t } = useLocale();
  const { data, isLoading } = useAdminProducts();
  const del = useDeleteProduct();

  async function handleDelete(id: number) {
    if (!confirm(t('product.deleteConfirm'))) return;
    try {
      await del.mutateAsync(id);
      toast.success(t('product.delete'));
    } catch (err) {
      if (err instanceof ApiResponseError && err.status === 409) {
        toast.error(t('product.deleteConflict'));
      } else {
        toast.error(t('common.error'));
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-text-primary">{t('product.title')}</h1>
        <Button asChild>
          <Link to="/dashboard/products/new">
            <Plus className="mr-2 h-4 w-4" /> {t('product.new')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-text-secondary">{t('common.loading')}</p>
          ) : !data?.products.length ? (
            <p className="p-6 text-text-secondary">{t('product.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">{t('product.image')}</TableHead>
                  <TableHead>{t('product.nameZh')}</TableHead>
                  <TableHead>{t('product.category')}</TableHead>
                  <TableHead className="text-right">{t('product.price')}</TableHead>
                  <TableHead>{t('product.isActive')}</TableHead>
                  <TableHead className="w-32 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name_zh}
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded bg-bg-elevated" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{p.name_zh}</TableCell>
                    <TableCell className="text-text-secondary">{p.category?.slug}</TableCell>
                    <TableCell className="text-right">NT${p.price}</TableCell>
                    <TableCell>
                      {p.is_active ? (
                        <Badge className="bg-success/15 text-[color:var(--success-500)]">
                          {t('product.isActive')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/dashboard/products/${p.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(p.id)}
                          disabled={del.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-error" />
                        </Button>
                      </div>
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
