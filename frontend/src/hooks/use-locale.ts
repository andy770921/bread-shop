'use client';

import {
  createElement,
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { defaultContent } from '@repo/shared';
import { Locale } from '../i18n/config';
import { getOppositeLocale } from '../i18n/utils';
import { mergeOverrides } from '../i18n/merge-overrides';
import { useSiteContent } from '../queries/use-site-content';

const baseMessages = defaultContent;

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

  const { data: siteContent } = useSiteContent();

  const messages = useMemo(() => {
    const defaults = baseMessages[locale];
    if (!siteContent?.overrides?.length) return defaults;
    return mergeOverrides(defaults, siteContent.overrides, locale);
  }, [locale, siteContent]);

  const t = useCallback(
    (key: string): string => {
      const keys = key.split('.');
      let result: unknown = messages;
      for (const k of keys) {
        if (result && typeof result === 'object') {
          result = (result as Record<string, unknown>)[k];
        } else {
          result = undefined;
          break;
        }
      }
      return typeof result === 'string' ? result : key;
    },
    [messages],
  );

  const toggleLocale = useCallback(() => {
    const next = getOppositeLocale(locale);
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
