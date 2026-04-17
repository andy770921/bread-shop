import type { Locale } from './config';

interface LocalizedValue<T> {
  zh: T;
  en: T;
}

export function pickByLocale<T>(locale: Locale, values: LocalizedValue<T>): T {
  return locale === 'zh' ? values.zh : values.en;
}

export function pickLocalizedText(
  locale: Locale,
  values: LocalizedValue<string | null | undefined>,
): string {
  const primary = pickByLocale(locale, values)?.trim();
  if (primary) {
    return primary;
  }

  const fallbackLocale: Locale = locale === 'zh' ? 'en' : 'zh';
  return pickByLocale(fallbackLocale, values)?.trim() ?? '';
}

export function getOppositeLocale(locale: Locale): Locale {
  return locale === 'zh' ? 'en' : 'zh';
}

export function toIntlLocale(locale: Locale): string {
  return pickByLocale(locale, { zh: 'zh-TW', en: 'en-US' });
}
