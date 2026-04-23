import { useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Save } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { groupRowsBySection, type ContentRow } from '@/lib/content-keys';
import {
  useAdminSiteContent,
  useUpsertSiteContent,
  useResetSiteContent,
} from '@/queries/useSiteContent';
import { useLocale } from '@/hooks/use-locale';

export default function ContentEditor() {
  const { t } = useLocale();
  const { data, isLoading } = useAdminSiteContent();
  const upsert = useUpsertSiteContent();
  const reset = useResetSiteContent();

  const groups = useMemo(() => groupRowsBySection(data?.overrides ?? []), [data]);
  const sections = Object.keys(groups);
  const [activeSection, setActiveSection] = useState<string>('');

  useEffect(() => {
    if (!activeSection && sections.length > 0) setActiveSection(sections[0]);
  }, [sections, activeSection]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-text-primary">{t('content.title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('content.subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-text-tertiary">Loading…</div>
      ) : (
        <Tabs value={activeSection} onValueChange={setActiveSection}>
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <TabsList className="w-max md:w-fit md:flex-wrap">
              {sections.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {sections.map((s) => (
            <TabsContent key={s} value={s} className="space-y-3">
              {groups[s].map((row) => (
                <ContentKeyRow
                  key={row.key}
                  row={row}
                  onSave={async (zh, en) => {
                    await upsert.mutateAsync({
                      key: row.key,
                      body: { value_zh: zh, value_en: en },
                    });
                    toast.success(t('content.saved'));
                  }}
                  onReset={async () => {
                    await reset.mutateAsync(row.key);
                    toast.success(t('content.reset'));
                  }}
                />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

interface RowProps {
  row: ContentRow;
  onSave: (zh: string, en: string) => Promise<void>;
  onReset: () => Promise<void>;
}

function ContentKeyRow({ row, onSave, onReset }: RowProps) {
  const { t } = useLocale();
  const [zh, setZh] = useState(row.value_zh);
  const [en, setEn] = useState(row.value_en);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setZh(row.value_zh);
    setEn(row.value_en);
  }, [row.value_zh, row.value_en]);

  const dirty = zh !== row.value_zh || en !== row.value_en;
  const longText = row.default_zh.length > 80 || row.default_en.length > 80;
  const ZhInput = longText ? Textarea : Input;
  const EnInput = longText ? Textarea : Input;

  async function save() {
    setSaving(true);
    try {
      await onSave(zh, en);
    } finally {
      setSaving(false);
    }
  }

  async function doReset() {
    setResetting(true);
    try {
      await onReset();
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <code className="truncate text-xs text-text-tertiary">{row.key}</code>
          <div className="flex gap-2 self-end sm:self-auto">
            <Button type="button" variant="ghost" size="sm" onClick={doReset} disabled={resetting}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              {t('content.reset')}
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving || !dirty}>
              <Save className="mr-2 h-3.5 w-3.5" />
              {saving ? t('content.saving') : t('content.save')}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('content.zh')}</Label>
            <ZhInput value={zh} onChange={(e) => setZh(e.target.value)} />
            <p className="text-xs text-text-tertiary">
              {t('content.defaultZh')} {row.default_zh || '—'}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('content.en')}</Label>
            <EnInput value={en} onChange={(e) => setEn(e.target.value)} />
            <p className="text-xs text-text-tertiary">
              {t('content.defaultEn')} {row.default_en || '—'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
