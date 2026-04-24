'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { SeasonalBanner } from '@/components/layout/seasonal-banner';
import { CategoryPills } from '@/components/product/category-pills';
import { ViewToggle } from '@/components/product/view-toggle';
import { ProductGrid, PRODUCT_GRID_TEMPLATE_COLUMNS } from '@/components/product/product-grid';
import { ProductShowcase } from '@/components/product/product-showcase';
import { ProcessSection } from '@/components/home/process-section';
import { StorySection } from '@/components/home/story-section';
import { HomeContentBlocks } from '@/components/home/home-content-blocks';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { useLocale } from '@/hooks/use-locale';
import { useAuth } from '@/lib/auth-context';
import { useProducts } from '@/queries/use-products';
import { useCategories } from '@/queries/use-categories';
import { useFavorites } from '@/queries/use-favorites';

const STORAGE_URL =
  'https://wqgaujuapacxuhvfatii.supabase.co/storage/v1/object/public/product-images/';

export default function Home() {
  const { locale, t } = useLocale();
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

        {/* Hero Section */}
        <section className="relative flex h-[600px] items-center justify-center overflow-hidden">
          <Image
            src={`${STORAGE_URL}hero-bakery.jpg`}
            alt="Papa Bakery Hero"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0" style={{ backgroundColor: 'var(--bg-overlay)' }} />
          <div className="relative z-10 flex flex-col items-center gap-4 px-4 text-center">
            <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
              {t('home.title')}
            </h1>
            <p className="max-w-lg text-lg text-white/90 sm:text-xl">{t('home.subtitle')}</p>
          </div>
        </section>

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
        <StorySection />
        <HomeContentBlocks />
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
