'use client';

import { useLocale } from '@/hooks/use-locale';
import { useShopSettings } from '@/queries/use-shop-settings';

export function SeasonalBanner() {
  const { t } = useLocale();
  const { data: settings } = useShopSettings();

  if (!settings || settings.promoBannerEnabled === false) return null;

  return (
    <div
      className="py-2 text-center text-sm font-medium tracking-wide"
      style={{
        background: 'var(--banner-gradient)',
        color: '#fff',
      }}
    >
      {t('banner.text')}
    </div>
  );
}
