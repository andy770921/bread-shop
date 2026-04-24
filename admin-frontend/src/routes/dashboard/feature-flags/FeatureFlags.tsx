import { useLocale } from '@/hooks/use-locale';
import { HomeVisibleCategoriesSection } from '@/components/feature-flags/HomeVisibleCategoriesSection';

export default function FeatureFlags() {
  const { t } = useLocale();
  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="font-serif text-lg font-bold text-text-primary md:text-2xl">
        {t('featureFlags.title')}
      </h1>
      <HomeVisibleCategoriesSection />
    </div>
  );
}
