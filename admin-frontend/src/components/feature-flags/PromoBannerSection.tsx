import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { ShopSettings } from '@repo/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useContentT } from '@/hooks/use-content-t';
import { useLocale } from '@/hooks/use-locale';
import { useUpdateShopSettings } from '@/queries/useFeatureFlags';
import { extractErrorMessage } from '@/lib/extract-error-message';

interface Props {
  initial: ShopSettings;
}

export function PromoBannerSection({ initial }: Props) {
  const { t } = useLocale();
  const contentT = useContentT();
  const [enabled, setEnabled] = useState(initial.promoBannerEnabled);
  const update = useUpdateShopSettings();

  useEffect(() => setEnabled(initial.promoBannerEnabled), [initial.promoBannerEnabled]);

  const dirty = enabled !== initial.promoBannerEnabled;

  async function handleSave() {
    try {
      await update.mutateAsync({ ...initial, promoBannerEnabled: enabled });
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
            {t('featureFlags.promoBanner.title')}
          </h2>
          <p className="text-sm text-text-secondary">{t('featureFlags.promoBanner.help')}</p>
        </div>

        <Label className="flex cursor-pointer items-center gap-3">
          <Switch checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
          <span>{t('featureFlags.promoBanner.enabledLabel')}</span>
        </Label>

        <div className="rounded-md border border-border-default bg-bg-surface px-3 py-2">
          <p className="text-xs text-text-tertiary">{t('featureFlags.promoBanner.previewLabel')}</p>
          <p className="text-sm font-medium text-text-primary">{contentT('banner.text')}</p>
          <Link
            to="/dashboard/content"
            className="mt-1 inline-block text-xs text-primary underline"
          >
            {t('featureFlags.promoBanner.editLink')}
          </Link>
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
