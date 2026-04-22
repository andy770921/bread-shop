import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Save } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getContentGroups } from '@/lib/content-keys';
import {
  useAdminSiteContent,
  useDeleteSiteContent,
  useUpsertSiteContent,
} from '@/queries/useSiteContent';
import { useLocale } from '@/hooks/use-locale';

export default function ContentEditor() {
  const { t } = useLocale();
  const groups = useMemo(() => getContentGroups(), []);
  const sections = Object.keys(groups);
  const [activeSection, setActiveSection] = useState<string>(sections[0] ?? '');
  const { data } = useAdminSiteContent();
  const upsert = useUpsertSiteContent();
  const del = useDeleteSiteContent();

  const overrideMap = useMemo(() => {
    const map = new Map<string, { zh: string | null; en: string | null }>();
    for (const o of data?.overrides ?? []) {
      map.set(o.key, { zh: o.value_zh, en: o.value_en });
    }
    return map;
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-text-primary">{t('content.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('content.subtitle')}</p>
      </div>

      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="flex-wrap">
          {sections.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((s) => (
          <TabsContent key={s} value={s} className="space-y-3">
            {groups[s].map((entry) => (
              <ContentKeyRow
                key={entry.key}
                entry={entry}
                override={overrideMap.get(entry.key)}
                onSave={async (zh, en) => {
                  await upsert.mutateAsync({
                    key: entry.key,
                    body: { value_zh: zh, value_en: en },
                  });
                  toast.success(t('content.saved'));
                }}
                onReset={async () => {
                  await del.mutateAsync(entry.key);
                  toast.success(t('content.reset'));
                }}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface RowProps {
  entry: { key: string; defaultZh: string; defaultEn: string };
  override?: { zh: string | null; en: string | null };
  onSave: (zh: string | null, en: string | null) => Promise<void>;
  onReset: () => Promise<void>;
}

function ContentKeyRow({ entry, override, onSave, onReset }: RowProps) {
  const { t } = useLocale();
  const [zh, setZh] = useState(override?.zh ?? '');
  const [en, setEn] = useState(override?.en ?? '');
  const [saving, setSaving] = useState(false);

  const longText = entry.defaultZh.length > 80 || entry.defaultEn.length > 80;
  const ZhInput = longText ? Textarea : Input;
  const EnInput = longText ? Textarea : Input;

  async function save() {
    setSaving(true);
    try {
      await onSave(zh || null, en || null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between gap-3">
          <code className="text-xs text-text-tertiary">{entry.key}</code>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={!override}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              {t('content.reset')}
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              <Save className="mr-2 h-3.5 w-3.5" />
              {saving ? t('content.saving') : t('content.save')}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('content.zh')}</Label>
            <ZhInput
              value={zh}
              onChange={(e) => setZh(e.target.value)}
              placeholder={entry.defaultZh}
            />
            <p className="text-xs text-text-tertiary">
              {t('content.defaultZh')} {entry.defaultZh}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('content.en')}</Label>
            <EnInput
              value={en}
              onChange={(e) => setEn(e.target.value)}
              placeholder={entry.defaultEn}
            />
            <p className="text-xs text-text-tertiary">
              {t('content.defaultEn')} {entry.defaultEn}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
