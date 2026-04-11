'use client';

import { toast } from 'sonner';
import { ProductCard } from './product-card';
import { useAuth } from '@/lib/auth-context';
import { useAddToCart } from '@/queries/use-cart';
import { useToggleFavorite } from '@/queries/use-favorites';
import { useLocale } from '@/hooks/use-locale';
import type { ProductWithCategory } from '@repo/shared';

interface ProductGridProps {
  products: ProductWithCategory[];
  favoriteIds: number[];
  locale: string;
}

export function ProductGrid({ products, favoriteIds, locale }: ProductGridProps) {
  const { user } = useAuth();
  const { t } = useLocale();
  const addToCart = useAddToCart();
  const toggleFavorite = useToggleFavorite();

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

  const handleToggleFavorite = (productId: number, isFavorited: boolean) => {
    toggleFavorite.mutate({ productId, isFavorited });
  };

  return (
    <div
      className="grid gap-6"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}
    >
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          locale={locale}
          isFavorited={favoriteIds.includes(product.id)}
          onAddToCart={handleAddToCart}
          onToggleFavorite={handleToggleFavorite}
          isLoggedIn={!!user}
        />
      ))}
    </div>
  );
}
