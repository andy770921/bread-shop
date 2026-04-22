import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import zhMessages from '@/i18n/zh.json';
import enMessages from '@/i18n/en.json';
import { defaultLocale, type Locale } from '@/i18n/config';
import { getOppositeLocale, toIntlLocale } from '@/i18n/utils';

type NestedRecord = { [key: string]: string | NestedRecord };

const messages: Record<Locale, NestedRecord> = {
  zh: zhMessages as NestedRecord,
  en: enMessages as NestedRecord,
};

const STORAGE_KEY = 'admin_locale';

interface LocaleContextType {
  locale: Locale;
  t: (key: string) => string;
  toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === 'undefined') return defaultLocale;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'zh' || stored === 'en' ? stored : defaultLocale;
  });

  useEffect(() => {
    document.documentElement.lang = toIntlLocale(locale);
  }, [locale]);

  const t = useCallback(
    (key: string): string => {
      const parts = key.split('.');
      let current: unknown = messages[locale];
      for (const p of parts) {
        if (current && typeof current === 'object') {
          current = (current as NestedRecord)[p];
        } else {
          return key;
        }
      }
      return typeof current === 'string' ? current : key;
    },
    [locale],
  );

  const toggleLocale = useCallback(() => {
    setLocale((prev) => {
      const next = getOppositeLocale(prev);
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ locale, t, toggleLocale }), [locale, t, toggleLocale]);

  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}
