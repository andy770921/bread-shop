import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import zhMessages from '@/i18n/zh.json';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

type NestedRecord = { [key: string]: string | NestedRecord };

const messages: Record<Locale, NestedRecord> = {
  zh: zhMessages as NestedRecord,
};

interface LocaleContextType {
  locale: Locale;
  t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale: Locale = DEFAULT_LOCALE;

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

  const value = useMemo(() => ({ locale, t }), [locale, t]);

  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}
