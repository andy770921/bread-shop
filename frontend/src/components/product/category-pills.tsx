'use client';

import { Button } from '@/components/ui/button';
import type { Category } from '@repo/shared';
import { useLocale } from '@/hooks/use-locale';

interface CategoryPillsProps {
  categories: Category[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
  locale: string;
}

export function CategoryPills({ categories, selected, onSelect, locale }: CategoryPillsProps) {
  const { t } = useLocale();
  const allLabel = t('home.allCategories');

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSelect(null)}
        className="rounded-full px-4 transition-all"
        style={
          selected === null
            ? {
                backgroundColor: 'var(--primary-500)',
                color: '#fff',
                borderColor: 'var(--primary-500)',
              }
            : {}
        }
      >
        {allLabel}
      </Button>
      {categories.map((cat) => (
        <Button
          key={cat.id}
          variant="outline"
          size="sm"
          onClick={() => onSelect(cat.slug)}
          className="rounded-full px-4 transition-all"
          style={
            selected === cat.slug
              ? {
                  backgroundColor: 'var(--primary-500)',
                  color: '#fff',
                  borderColor: 'var(--primary-500)',
                }
              : {}
          }
        >
          {locale === 'zh' ? cat.name_zh : cat.name_en}
        </Button>
      ))}
    </div>
  );
}
