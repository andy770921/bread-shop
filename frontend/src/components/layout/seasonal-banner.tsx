'use client';

import { useLocale } from '@/hooks/use-locale';

export function SeasonalBanner() {
  const { t } = useLocale();

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
