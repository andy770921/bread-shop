'use client';

import { toast } from 'sonner';
import { useAddToCart } from '@/queries/use-cart';
import { useLocale } from '@/hooks/use-locale';
import type { ProductWithCategory } from '@repo/shared';

export function useAddToCartHandler(products: ProductWithCategory[]) {
  const { t } = useLocale();
  const { addToCart } = useAddToCart({
    onError: () => toast.error('Failed to add to cart'),
  });

  const handleAddToCart = (productId: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    addToCart(productId, product.price);
    toast.success(t('home.addedToCart'));
  };

  return handleAddToCart;
}
