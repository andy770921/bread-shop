'use client';

import { toast } from 'sonner';
import { ProductEditorial } from './product-editorial';
import { useAddToCart } from '@/queries/use-cart';
import { useLocale } from '@/hooks/use-locale';
import type { ProductWithCategory } from '@repo/shared';

interface ProductShowcaseProps {
  products: ProductWithCategory[];
  locale: string;
}

export function ProductShowcase({ products, locale }: ProductShowcaseProps) {
  const addToCart = useAddToCart();
  const { t } = useLocale();

  const handleAddToCart = (productId: number) => {
    addToCart.mutate(
      { productId, quantity: 1 },
      {
        onSuccess: () => {
          toast.success(t('home.addedToCart'));
        },
        onError: () => {
          toast.error('Failed to add to cart');
        },
      },
    );
  };

  return (
    <div className="flex flex-col" style={{ gap: '120px' }}>
      {products.map((product, index) => (
        <ProductEditorial
          key={product.id}
          product={product}
          locale={locale}
          index={index}
          onAddToCart={handleAddToCart}
        />
      ))}
    </div>
  );
}
