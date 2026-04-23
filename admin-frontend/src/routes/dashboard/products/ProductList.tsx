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
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-xl font-bold text-text-primary md:text-2xl">
          {t('product.title')}
        </h1>
        <Button asChild>
          <Link to="/dashboard/products/new" aria-label={t('product.new')}>
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{t('product.new')}</span>
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent>
            <p className="p-6 text-text-secondary">{t('common.loading')}</p>
          </CardContent>
        </Card>
      ) : !data?.products.length ? (
        <Card>
          <CardContent>
            <p className="p-6 text-text-secondary">{t('product.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
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
            </CardContent>
          </Card>

          {/* Mobile card list */}
          <div className="flex flex-col gap-3 md:hidden">
            {data.products.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex gap-3 p-3">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name_zh}
                      className="h-16 w-16 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded bg-bg-elevated" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {p.name_zh}
                        </p>
                        {p.is_active ? (
                          <Badge className="shrink-0 bg-success/15 text-[color:var(--success-500)]">
                            {t('product.isActive')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0">
                            —
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-text-secondary">
                        <span className="truncate">{p.category?.slug ?? '—'}</span>
                        <span>·</span>
                        <span className="shrink-0">NT${p.price}</span>
                      </div>
                    </div>
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
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
