'use client';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';

interface ViewToggleProps {
  active: boolean;
  onToggle: () => void;
}

export function ViewToggle({ active, onToggle }: ViewToggleProps) {
  const { t } = useLocale();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
      className="rounded-full px-4 transition-all"
      style={
        active
          ? { backgroundColor: 'var(--primary-500)', color: '#fff', borderColor: 'var(--primary-500)' }
          : {}
      }
    >
      {t('home.editorialToggle')}
    </Button>
  );
}
