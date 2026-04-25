import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ShopSettings } from '@repo/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/hooks/use-locale';
import { useUpdateShopSettings } from '@/queries/useFeatureFlags';
import { extractErrorMessage } from '@/lib/extract-error-message';

interface Props {
  initial: ShopSettings;
}

export function ShippingSettingsSection({ initial }: Props) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(initial);
  const update = useUpdateShopSettings();

  useEffect(() => setDraft(initial), [initial]);

  const dirty =
    draft.shippingEnabled !== initial.shippingEnabled ||
    draft.shippingFee !== initial.shippingFee ||
    draft.freeShippingThreshold !== initial.freeShippingThreshold;

  async function handleSave() {
    if (draft.shippingEnabled) {
      if (
        !Number.isInteger(draft.shippingFee) ||
        draft.shippingFee < 0 ||
        draft.shippingFee > 9999
      ) {
        toast.error(t('featureFlags.shipping.errorFeeRange'));
        return;
      }
      if (
        !Number.isInteger(draft.freeShippingThreshold) ||
        draft.freeShippingThreshold < 0 ||
        draft.freeShippingThreshold > 999999
      ) {
        toast.error(t('featureFlags.shipping.errorThresholdRange'));
        return;
      }
    }
    try {
      await update.mutateAsync(draft);
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
            {t('featureFlags.shipping.title')}
          </h2>
          <p className="text-sm text-text-secondary">{t('featureFlags.shipping.help')}</p>
        </div>

        <Label className="flex cursor-pointer items-center gap-3">
          <Switch
            checked={draft.shippingEnabled}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, shippingEnabled: Boolean(v) }))}
          />
          <span>{t('featureFlags.shipping.enabledLabel')}</span>
        </Label>

        {draft.shippingEnabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="shippingFee">{t('featureFlags.shipping.feeLabel')}</Label>
              <Input
                id="shippingFee"
                type="number"
                min={0}
                max={9999}
                value={draft.shippingFee}
                onChange={(e) => setDraft((d) => ({ ...d, shippingFee: Number(e.target.value) }))}
                className="mt-1 w-32"
              />
            </div>
            <div>
              <Label htmlFor="freeShippingThreshold">
                {t('featureFlags.shipping.thresholdLabel')}
              </Label>
              <Input
                id="freeShippingThreshold"
                type="number"
                min={0}
                max={999999}
                value={draft.freeShippingThreshold}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, freeShippingThreshold: Number(e.target.value) }))
                }
                className="mt-1 w-40"
              />
              <p className="mt-1 text-xs text-text-tertiary">
                {t('featureFlags.shipping.thresholdHelp')}
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || update.isPending}>
            {update.isPending ? t('featureFlags.saving') : t('featureFlags.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
