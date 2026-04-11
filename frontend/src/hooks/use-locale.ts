'use client';

import { useState, useCallback } from 'react';
import zhMessages from '../i18n/zh.json';
import enMessages from '../i18n/en.json';
import { Locale } from '../i18n/config';

const messages: Record<Locale, typeof zhMessages> = { zh: zhMessages, en: enMessages };

export function useLocale() {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('locale') as Locale) || 'zh';
    }
    return 'zh';
  });

  const t = useCallback(
    (key: string): string => {
      const keys = key.split('.');
      let result: any = messages[locale];
      for (const k of keys) {
        result = result?.[k];
      }
      return result || key;
    },
    [locale],
  );

  const toggleLocale = useCallback(() => {
    const next = locale === 'zh' ? 'en' : 'zh';
    setLocale(next);
    localStorage.setItem('locale', next);
  }, [locale]);

  return { locale, t, toggleLocale };
}
