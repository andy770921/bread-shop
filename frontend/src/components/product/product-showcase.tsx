'use client';

import { ProductEditorial } from './product-editorial';
import { useAddToCartHandler } from '@/hooks/use-add-to-cart-handler';
import type { ProductWithCategory } from '@repo/shared';

interface ProductShowcaseProps {
  products: ProductWithCategory[];
  locale: string;
}

export function ProductShowcase({ products, locale }: ProductShowcaseProps) {
  const handleAddToCart = useAddToCartHandler(products);

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
