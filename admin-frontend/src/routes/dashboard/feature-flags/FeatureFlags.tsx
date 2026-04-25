import { useLocale } from '@/hooks/use-locale';
import { useFeatureFlags } from '@/queries/useFeatureFlags';
import { HomeVisibleCategoriesSection } from '@/components/feature-flags/HomeVisibleCategoriesSection';
import { PromoBannerSection } from '@/components/feature-flags/PromoBannerSection';
import { ShippingSettingsSection } from '@/components/feature-flags/ShippingSettingsSection';

export default function FeatureFlags() {
  const { t } = useLocale();
  const { data } = useFeatureFlags();
  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="font-serif text-lg font-bold text-text-primary md:text-2xl">
        {t('featureFlags.title')}
      </h1>
      <HomeVisibleCategoriesSection />
      {data?.shopSettings && (
        <>
          <ShippingSettingsSection initial={data.shopSettings} />
          <PromoBannerSection initial={data.shopSettings} />
        </>
      )}
    </div>
  );
}
