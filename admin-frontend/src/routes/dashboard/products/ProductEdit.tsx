import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductForm, type ProductFormValues } from '@/components/products/ProductForm';
import { useAdminProduct, useUpdateProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';
import { extractErrorMessage } from '@/lib/extract-error-message';

export default function ProductEdit() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { id: idParam } = useParams();
  const id = idParam ? Number(idParam) : null;
  const { data, isLoading } = useAdminProduct(id);
  const update = useUpdateProduct(id ?? 0);

  async function handleSubmit(values: ProductFormValues) {
    try {
      await update.mutateAsync({
        ...values,
        badge_type: values.badge_type || null,
        image_url: values.image_url || null,
      });
      toast.success(t('product.save'));
      navigate('/dashboard/products');
    } catch (err) {
      console.error('Product update failed', err);
      toast.error(`${t('product.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`);
    }
  }

  if (isLoading || !data) {
    return <p className="text-text-secondary">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard/products')}
          aria-label={t('product.backToList')}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">{t('product.backToList')}</span>
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-serif text-lg font-bold text-text-primary md:text-2xl">
          {t('product.edit')}: {data.name_zh}
        </h1>
      </div>
      <ProductForm
        initial={data}
        onSubmit={handleSubmit}
        submitting={update.isPending}
        productId={data.id}
      />
    </div>
  );
}
