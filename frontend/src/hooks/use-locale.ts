'use client';

import {
  createElement,
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import zhMessages from '../i18n/zh.json';
import enMessages from '../i18n/en.json';
import { Locale } from '../i18n/config';

const messages: Record<Locale, typeof zhMessages> = { zh: zhMessages, en: enMessages };

interface LocaleContextType {
  locale: Locale;
  t: (key: string) => string;
  toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
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

  return createElement(LocaleContext.Provider, { value: { locale, t, toggleLocale } }, children);
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return ctx;
}
