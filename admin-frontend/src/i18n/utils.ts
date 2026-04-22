import type { Locale } from './config';

export function getOppositeLocale(locale: Locale): Locale {
  return locale === 'zh' ? 'en' : 'zh';
}

export function toIntlLocale(locale: Locale): string {
  return locale === 'zh' ? 'zh-TW' : 'en';
}
