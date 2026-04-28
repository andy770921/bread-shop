'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { SeasonalBanner } from '@/components/layout/seasonal-banner';
import { CategoryPills } from '@/components/product/category-pills';
import { ViewToggle } from '@/components/product/view-toggle';
import { ProductGrid, PRODUCT_GRID_TEMPLATE_COLUMNS } from '@/components/product/product-grid';
import { ProductShowcase } from '@/components/product/product-showcase';
import { ProcessSection } from '@/components/home/process-section';
import { HeroCarousel } from '@/components/home/hero-carousel';
import { HomeContentBlocks } from '@/components/home/home-content-blocks';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';
import { useProducts } from '@/queries/use-products';
import { useCategories } from '@/queries/use-categories';
import { useFavorites } from '@/queries/use-favorites';

export default function Home() {
  const { locale } = useLocale();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editorialView, setEditorialView] = useState(false);

  const { data: productsData, isLoading: productsLoading } = useProducts(
    selectedCategory ?? undefined,
  );
  const { data: categoriesData } = useCategories();
  const { data: favoritesData } = useFavorites(!!user);

  const products = productsData?.products ?? [];
  const categories = categoriesData?.categories ?? [];
  const favoriteIds = favoritesData?.product_ids ?? [];

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-body)' }}>
        <Header />
        <SeasonalBanner />

        <HeroCarousel />

        {/* Products Section */}
        <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CategoryPills
              categories={categories}
              selected={selectedCategory}
              onSelect={setSelectedCategory}
            />
            <ViewToggle active={editorialView} onToggle={() => setEditorialView(!editorialView)} />
          </div>

          {productsLoading ? (
            <div
              className="grid gap-6"
              style={{ gridTemplateColumns: PRODUCT_GRID_TEMPLATE_COLUMNS }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="h-[240px] w-full rounded-xl" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : editorialView ? (
            <ProductShowcase products={products} locale={locale} />
          ) : (
            <ProductGrid products={products} favoriteIds={favoriteIds} locale={locale} />
          )}
        </main>

        <ProcessSection />
        <HomeContentBlocks />
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
