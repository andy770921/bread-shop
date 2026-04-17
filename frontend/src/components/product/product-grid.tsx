'use client';

import { ProductCard } from './product-card';
import type { Locale } from '@/i18n/config';
import { useAuth } from '@/lib/auth-context';
import { useToggleFavorite } from '@/queries/use-favorites';
import { useAddToCartHandler } from '@/hooks/use-add-to-cart-handler';
import type { ProductWithCategory } from '@repo/shared';

interface ProductGridProps {
  products: ProductWithCategory[];
  favoriteIds: number[];
  locale: Locale;
}

export const PRODUCT_GRID_TEMPLATE_COLUMNS = 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))';

export function ProductGrid({ products, favoriteIds, locale }: ProductGridProps) {
  const { user } = useAuth();
  const handleAddToCart = useAddToCartHandler(products);
  const toggleFavorite = useToggleFavorite();

  const handleToggleFavorite = (productId: number, isFavorited: boolean) => {
    toggleFavorite.mutate({ productId, isFavorited });
  };

  return (
    <div
      className="grid gap-6"
      style={{
        gridTemplateColumns: PRODUCT_GRID_TEMPLATE_COLUMNS,
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
