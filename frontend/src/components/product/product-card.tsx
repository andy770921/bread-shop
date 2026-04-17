'use client';

import { Heart, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { Locale } from '@/i18n/config';
import { pickLocalizedText } from '@/i18n/utils';
import { ProductImage } from './product-image';
import type { ProductWithCategory, BadgeType } from '@repo/shared';
import { useLocale } from '@/hooks/use-locale';

interface ProductCardProps {
  product: ProductWithCategory;
  locale: Locale;
  isFavorited: boolean;
  onAddToCart: (productId: number) => void;
  onToggleFavorite: (productId: number, isFavorited: boolean) => void;
  isLoggedIn: boolean;
}

function getBadgeStyle(type: BadgeType | null) {
  switch (type) {
    case 'hot':
      return { backgroundColor: '#DC2626', color: '#fff' };
    case 'new':
      return { backgroundColor: '#F59E0B', color: '#fff' };
    case 'seasonal':
      return { backgroundColor: '#10B981', color: '#fff' };
    default:
      return {};
  }
}

export function ProductCard({
  product,
  locale,
  isFavorited,
  onAddToCart,
  onToggleFavorite,
  isLoggedIn,
}: ProductCardProps) {
  const { t } = useLocale();
  const name = pickLocalizedText(locale, { zh: product.name_zh, en: product.name_en });
  const categoryName = t(`category.${product.category.slug}`);
  const badgeText = product.badge_type ? t(`badge.${product.badge_type}`) : null;

  return (
    <Card
      className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1.5"
      style={{
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Image */}
      <div className="relative h-[240px] w-full overflow-hidden">
        <ProductImage
          src={product.image_url}
          alt={name}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          imageClassName="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Badge */}
        {product.badge_type && badgeText && (
          <Badge
            className="absolute left-3 top-3 rounded-md px-2 py-0.5 text-xs font-semibold"
            style={getBadgeStyle(product.badge_type)}
          >
            {badgeText}
          </Badge>
        )}
        {/* Favorite Button */}
        {isLoggedIn && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onToggleFavorite(product.id, isFavorited);
            }}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition-all hover:bg-white"
            aria-label="Toggle favorite"
          >
            <Heart
              className="h-4 w-4 transition-colors"
              style={{
                color: isFavorited ? '#DC2626' : 'var(--text-secondary)',
                fill: isFavorited ? '#DC2626' : 'transparent',
              }}
            />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
        <span className="text-xs font-medium" style={{ color: 'var(--primary-500)' }}>
          {categoryName}
        </span>
        <h3
          className="font-heading text-base font-semibold leading-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {name}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-lg font-bold" style={{ color: 'var(--primary-700)' }}>
            NT${product.price}
          </span>
          <Button
            size="sm"
            className="gap-1.5 rounded-full"
            style={{ backgroundColor: 'var(--primary-500)', color: '#fff' }}
            onClick={() => onAddToCart(product.id)}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            {t('home.addToCart')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
