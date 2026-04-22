import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { getOppositeLocale } from '@/i18n/utils';

const LABELS: Record<'zh' | 'en', string> = {
  zh: '中文',
  en: 'EN',
};

export function LocaleToggle({ className }: { className?: string }) {
  const { locale, toggleLocale } = useLocale();
  const next = getOppositeLocale(locale);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLocale}
      aria-label={`Switch language to ${LABELS[next]}`}
      className={className}
    >
      {LABELS[next]}
    </Button>
  );
}
