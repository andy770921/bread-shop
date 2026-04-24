import { useCallback, useMemo } from 'react';
import { defaultContent, type NestedRecord } from '@repo/shared';
import { useLocale } from '@/hooks/use-locale';
import { useAdminSiteContent } from '@/queries/useSiteContent';

/**
 * Localize a *customer-facing* content key (e.g. `category.toast`,
 * `badge.hot`) the same way the customer frontend does: `defaultContent`
 * from `@repo/shared` as the baseline, with `site_content` overrides
 * layered on top.
 *
 * Distinct from `useLocale().t`, which resolves admin-UI strings only
 * (e.g. 商品管理 / 儲存中…) from `admin-frontend/src/i18n/{zh,en}.json`.
 */
export function useContentT() {
  const { locale } = useLocale();
  const { data } = useAdminSiteContent();

  const overrideLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of data?.overrides ?? []) {
      const val = locale === 'zh' ? o.value_zh : o.value_en;
      if (val != null && val !== '') map.set(o.key, val);
    }
    return map;
  }, [locale, data]);

  return useCallback(
    (key: string): string => {
      const override = overrideLookup.get(key);
      if (override) return override;

      const parts = key.split('.');
      let current: unknown = defaultContent[locale];
      for (const p of parts) {
        if (current && typeof current === 'object') {
          current = (current as NestedRecord)[p];
        } else {
          return key;
        }
      }
      return typeof current === 'string' ? current : key;
    },
    [locale, overrideLookup],
  );
}
