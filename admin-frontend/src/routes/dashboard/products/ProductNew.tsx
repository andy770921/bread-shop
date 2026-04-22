import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductForm, type ProductFormValues } from '@/components/products/ProductForm';
import { useCreateProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';

export default function ProductNew() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const create = useCreateProduct();

  async function handleSubmit(values: ProductFormValues) {
    try {
      await create.mutateAsync({
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/products')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('product.backToList')}
        </Button>
        <h1 className="font-serif text-2xl font-bold text-text-primary">{t('product.new')}</h1>
      </div>
      <ProductForm onSubmit={handleSubmit} submitting={create.isPending} />
    </div>
  );
}
