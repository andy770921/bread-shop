import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductForm, type ProductFormValues } from '@/components/products/ProductForm';
import { useAdminProduct, useUpdateProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';

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
      console.error(err);
      toast.error(t('common.error'));
    }
  }

  if (isLoading || !data) {
    return <p className="text-text-secondary">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/products')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('product.backToList')}
        </Button>
        <h1 className="font-serif text-2xl font-bold text-text-primary">
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
