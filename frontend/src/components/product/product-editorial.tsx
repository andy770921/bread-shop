'use client';

import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Locale } from '@/i18n/config';
import { pickLocalizedText } from '@/i18n/utils';
import { ProductImage } from './product-image';
import type { ProductWithCategory } from '@repo/shared';
import { useLocale } from '@/hooks/use-locale';
import { useShopSettings } from '@/queries/use-shop-settings';

interface ProductEditorialProps {
  product: ProductWithCategory;
  locale: Locale;
  index: number;
  onAddToCart: (productId: number) => void;
}

export function ProductEditorial({ product, locale, index, onAddToCart }: ProductEditorialProps) {
  const { t } = useLocale();
  const { data: shopSettings } = useShopSettings();
  const showInventory = shopSettings?.inventoryMode === 'daily_total';
  const ingredientsValue = pickLocalizedText(locale, {
    zh: product.ingredients_zh,
    en: product.ingredients_en,
  });
  const name = pickLocalizedText(locale, { zh: product.name_zh, en: product.name_en });
  const description = pickLocalizedText(locale, {
    zh: product.description_zh,
    en: product.description_en,
  });
  const categoryName = t(`category.${product.category.slug}`);
  const isEven = index % 2 === 0;
  const hasSpecsContent =
    (product.specs && product.specs.length > 0) || showInventory || Boolean(ingredientsValue);

  return (
    <div
      className={`flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-16 ${
        !isEven ? 'lg:flex-row-reverse' : ''
      }`}
    >
      {/* Image */}
      <div className="relative h-[360px] w-full overflow-hidden rounded-2xl lg:h-[500px] lg:w-1/2">
        <ProductImage
          src={product.image_url}
          alt={name}
          sizes="(max-width: 1024px) 100vw, 50vw"
          imageClassName="object-cover"
        />
        {product.badge_type && (
          <Badge
            className="absolute left-4 top-4 rounded-md px-3 py-1 text-sm font-semibold"
            style={
              product.badge_type === 'hot'
                ? { backgroundColor: '#DC2626', color: '#fff' }
                : product.badge_type === 'new'
                  ? { backgroundColor: '#F59E0B', color: '#fff' }
                  : { backgroundColor: '#10B981', color: '#fff' }
            }
          >
            {product.badge_type ? t(`badge.${product.badge_type}`) : ''}
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="flex w-full flex-col gap-4 lg:w-1/2">
        <span className="text-sm font-medium" style={{ color: 'var(--primary-500)' }}>
          {categoryName}
        </span>
        <h2
          className="font-heading text-2xl font-bold leading-tight lg:text-3xl"
          style={{ color: 'var(--text-primary)' }}
        >
          {name}
        </h2>
        {description && (
          <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
        )}

        {/* Specs Grid */}
        {hasSpecsContent && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {product.specs?.map((spec, i) => (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <span
                  className="block text-xs font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {t(`spec.${spec.label_key}`)}
                </span>
                <span
                  className="mt-1 block text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {pickLocalizedText(locale, { zh: spec.value_zh, en: spec.value_en })}
                </span>
              </div>
            ))}
            {showInventory && shopSettings && (
              <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <span
                  className="block text-xs font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {t('spec.daily_limit')}
                </span>
                <span
                  className="mt-1 block text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {shopSettings.dailyTotalLimit}
                </span>
              </div>
            )}
            {ingredientsValue && (
              <div
                className="col-span-2 rounded-lg p-3 lg:col-span-3"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <span
                  className="block text-xs font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {t('spec.ingredients')}
                </span>
                <span
                  className="mt-1 block whitespace-pre-line text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {ingredientsValue}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-6 pt-2">
          <span
            className="font-heading text-2xl font-bold lg:text-3xl"
            style={{ color: 'var(--primary-700)' }}
          >
            NT${product.price}
          </span>
          <Button
            size="lg"
            className="gap-2 rounded-full px-8"
            style={{
              background: 'var(--checkout-gradient)',
              color: '#fff',
            }}
            onClick={() => onAddToCart(product.id)}
          >
            <ShoppingCart className="h-4 w-4" />
            {t('home.addToCart')}
          </Button>
        </div>
      </div>
    </div>
  );
}
