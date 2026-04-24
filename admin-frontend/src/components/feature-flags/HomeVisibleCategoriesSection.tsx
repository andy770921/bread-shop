import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useCategories } from '@/queries/useAdminProducts';
import { useFeatureFlags, useUpdateHomeVisibleCategories } from '@/queries/useFeatureFlags';
import { useLocale } from '@/hooks/use-locale';
import { useContentT } from '@/hooks/use-content-t';
import { extractErrorMessage } from '@/lib/extract-error-message';

export function HomeVisibleCategoriesSection() {
  const { t } = useLocale();
  const contentT = useContentT();
  const { data: categoriesResp } = useCategories();
  const { data: flags } = useFeatureFlags();
  const update = useUpdateHomeVisibleCategories();

  const categories = useMemo(() => categoriesResp?.categories ?? [], [categoriesResp]);
  const serverIds = useMemo(() => new Set(flags?.homeVisibleCategoryIds ?? []), [flags]);

  const [selected, setSelected] = useState<Set<number>>(serverIds);
  useEffect(() => setSelected(new Set(serverIds)), [serverIds]);

  const dirty = selected.size !== serverIds.size || [...selected].some((id) => !serverIds.has(id));
  const empty = selected.size === 0;

  async function handleSave() {
    try {
      await update.mutateAsync({ category_ids: [...selected] });
      toast.success(t('featureFlags.saved'));
    } catch (err) {
      toast.error(
        `${t('featureFlags.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-serif text-lg font-bold text-text-primary">
            {t('featureFlags.homeCategoriesTitle')}
          </h2>
          <p className="text-sm text-text-secondary">{t('featureFlags.homeCategoriesHelp')}</p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {categories.map((c) => {
            const id = `home-cat-${c.id}`;
            return (
              <Label key={c.id} htmlFor={id} className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  id={id}
                  checked={selected.has(c.id)}
                  onCheckedChange={() => toggle(c.id)}
                />
                <span>{contentT(`category.${c.slug}`)}</span>
              </Label>
            );
          })}
        </div>

        {empty && <p className="text-xs text-error">{t('featureFlags.selectAtLeastOne')}</p>}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || empty || update.isPending}>
            {update.isPending ? t('featureFlags.saving') : t('featureFlags.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
