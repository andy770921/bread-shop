import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { InventoryMode, ShopSettings } from '@repo/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/hooks/use-locale';
import { useFeatureFlags, useUpdateShopSettings } from '@/queries/useFeatureFlags';
import { extractErrorMessage } from '@/lib/extract-error-message';

export function InventorySettingsSection() {
  const { t } = useLocale();
  const { data } = useFeatureFlags();
  const update = useUpdateShopSettings();
  const initial = data?.shopSettings;
  const [mode, setMode] = useState<InventoryMode>(initial?.inventoryMode ?? 'unlimited');
  const [limit, setLimit] = useState<number>(initial?.dailyTotalLimit ?? 3);

  useEffect(() => {
    if (!initial) return;
    setMode(initial.inventoryMode);
    setLimit(initial.dailyTotalLimit);
  }, [initial]);

  if (!initial) return null;

  const dirty = mode !== initial.inventoryMode || limit !== initial.dailyTotalLimit;

  async function handleSave() {
    if (!initial) return;
    if (mode === 'daily_total') {
      if (!Number.isInteger(limit) || limit < 1 || limit > 999) {
        toast.error(t('product.inventory.errorLimitRange'));
        return;
      }
    }
    const next: ShopSettings = { ...initial, inventoryMode: mode, dailyTotalLimit: limit };
    try {
      await update.mutateAsync(next);
      toast.success(t('featureFlags.saved'));
    } catch (err) {
      toast.error(
        `${t('featureFlags.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`,
      );
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-serif text-lg font-bold text-text-primary">
            {t('product.inventory.title')}
          </h2>
          <p className="text-sm text-text-secondary">{t('product.inventory.help')}</p>
        </div>

        <div className="grid gap-4 sm:max-w-md">
          <div>
            <Label htmlFor="inventoryMode">{t('product.inventory.modeLabel')}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as InventoryMode)}>
              <SelectTrigger id="inventoryMode" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unlimited">{t('product.inventory.modeUnlimited')}</SelectItem>
                <SelectItem value="daily_total">{t('product.inventory.modeDailyTotal')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'daily_total' && (
            <div>
              <Label htmlFor="dailyTotalLimit">{t('product.inventory.limitLabel')}</Label>
              <Input
                id="dailyTotalLimit"
                type="number"
                min={1}
                max={999}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="mt-1 w-32"
              />
              <p className="mt-1 text-xs text-text-tertiary">{t('product.inventory.limitHelp')}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || update.isPending}>
            {update.isPending ? t('featureFlags.saving') : t('featureFlags.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
