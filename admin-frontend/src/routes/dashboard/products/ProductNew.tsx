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
          {t('product.new')}
        </h1>
      </div>
      <ProductForm onSubmit={handleSubmit} submitting={create.isPending} />
    </div>
  );
}
