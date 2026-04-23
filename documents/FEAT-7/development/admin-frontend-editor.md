# Implementation Plan: Admin Content Editor

## Overview

Rewrite the admin content page (`/dashboard/content`) so inputs are pre-filled with values from the DB, empty string is a valid deliberate value, and the "Reset to default" button writes the JSON default back to the row instead of deleting it.

After this change, the DB response drives the list of keys and the initial input values. The JSON is still imported (via `@repo/shared`) to render the "Default: …" helper text and to let the client know "the value I'm about to send on reset is X" — but the actual reset is an API call.

## Files to Modify

- `admin-frontend/src/routes/dashboard/content/ContentEditor.tsx` — core rewrite.
- `admin-frontend/src/queries/useSiteContent.ts` — replace `useDeleteSiteContent` with `useResetSiteContent`.
- `admin-frontend/src/lib/content-keys.ts` — either delete, or reduce to a small helper that groups DB rows by section.

## Step-by-Step Implementation

### Step 1: Replace the delete hook with a reset hook

**File:** `admin-frontend/src/queries/useSiteContent.ts`

**Changes:**

- Delete `useDeleteSiteContent`.
- Add:

```ts
export function useResetSiteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      defaultFetchFn(`/api/admin/site-content/${encodeURIComponent(key)}/reset`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api', 'admin', 'site-content'] });
    },
  });
}
```

**Rationale:** mirrors the existing `useUpsertSiteContent` shape so the editor reads consistently.

### Step 2: Move key-grouping logic onto DB rows

**File:** `admin-frontend/src/lib/content-keys.ts`

**Option A — repurpose the file:** keep the file but change it to group a list of DB rows by dot-prefix, plus expose the JSON defaults as a separate helper.

**New content:**

```ts
import { defaultContent, type NestedRecord } from '@repo/shared';
import type { SiteContentEntry } from '@repo/shared';

function flatten(obj: NestedRecord, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') result[fullKey] = v;
    else Object.assign(result, flatten(v, fullKey));
  }
  return result;
}

const flatZh = flatten(defaultContent.zh);
const flatEn = flatten(defaultContent.en);

export function getDefault(key: string): { zh: string; en: string } {
  return { zh: flatZh[key] ?? '', en: flatEn[key] ?? '' };
}

export interface ContentRow {
  key: string;
  value_zh: string;
  value_en: string;
  default_zh: string;
  default_en: string;
}

export function groupRowsBySection(entries: SiteContentEntry[]): Record<string, ContentRow[]> {
  const groups: Record<string, ContentRow[]> = {};
  for (const entry of entries) {
    const section = entry.key.split('.')[0] ?? 'misc';
    const d = getDefault(entry.key);
    if (!groups[section]) groups[section] = [];
    groups[section].push({
      key: entry.key,
      value_zh: entry.value_zh ?? '',
      value_en: entry.value_en ?? '',
      default_zh: d.zh,
      default_en: d.en,
    });
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.key.localeCompare(b.key));
  }
  return groups;
}
```

**Rationale:** the editor no longer needs the old "list every JSON key as an empty row" helper; that is replaced by "list every DB row, attaching the JSON default for the Reset / helper label". Orphan rows in the DB (key no longer in JSON) still render, with `default_zh: ''` — harmless.

### Step 3: Rewrite `ContentEditor.tsx`

**File:** `admin-frontend/src/routes/dashboard/content/ContentEditor.tsx`

**Full replacement:**

```tsx
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

  const groups = useMemo(
    () => groupRowsBySection(data?.overrides ?? []),
    [data],
  );
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
        <div className="text-sm text-text-tertiary">{t('content.loading') || 'Loading…'}</div>
      ) : (
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
        <div className="flex items-center justify-between gap-3">
          <code className="text-xs text-text-tertiary">{row.key}</code>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={doReset}
              disabled={resetting}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              {resetting ? t('content.resetting') || t('content.reset') : t('content.reset')}
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
```

**Key behavioral changes from the old component:**

1. Local state `zh` / `en` is initialized from the DB row, not `override ?? ''`. The input is never empty on first render unless the DB says so.
2. `useEffect` resets local state when the server row changes (e.g., after a successful reset invalidation). Without this, the input would keep stale local state after the user hit Reset.
3. `onSave` passes `zh` and `en` verbatim, including empty string. No `|| null` coercion.
4. Save is disabled when the local state matches the server state (`!dirty`), which gives operators an immediate visual signal that nothing is pending.
5. Reset is always enabled — no `disabled={!override}` check, because every row always has a corresponding JSON default (orphan rows excepted; see Notes).
6. `placeholder` is removed from the inputs. The "empty-looking" state now genuinely means the value is empty, not "unset".

### Step 4: Add locale strings for the loading state (optional)

**Files:** `shared/src/i18n/zh.json`, `shared/src/i18n/en.json`

**Changes:** if `content.loading` or `content.resetting` don't exist, add them. If you'd rather not touch locale files in this PR, just remove the `t('content.loading')` / `t('content.resetting')` references from Step 3 and hard-code `'Loading…'` — these are admin-only strings and v1 is zh-only (per CLAUDE.md).

**Rationale:** keeps the scope contained. Either decision is fine.

## Testing Steps

1. **Component test** (`admin-frontend/src/routes/dashboard/content/ContentEditor.spec.tsx`):
   - Render with a mocked query client. Seed the query cache with `{ overrides: [{ key: 'nav.home', value_zh: '首頁', value_en: 'Home', updated_at: '…', updated_by: null }] }`.
   - Assert the rendered `input` has `value="首頁"` — not empty, not a placeholder.
   - Fire `change` on the input to `''`, click Save. Assert the upsert mutation received `{ value_zh: '', value_en: 'Home' }`.
   - Click Reset. Assert the reset mutation was called with `'nav.home'`.

2. **Manual**:
   - Open `http://localhost:3002/dashboard/content`. Every input should show its current value on first render.
   - Clear one `zh` input, click Save. Refresh. The input should re-render empty.
   - Click Reset. The input should re-render with the JSON default.
   - Open the customer frontend in another tab. After a window focus / staleTime expiry, the reset change should be visible.

## Dependencies

- **Must complete after:** `shared-i18n-migration.md` (imports `defaultContent` from `@repo/shared`), `backend-sync-and-reset.md` (relies on the new reset endpoint and on DB being pre-populated).

## Notes

- Orphan rows (DB has `key` that JSON no longer has): render with `default_zh: ''` and `default_en: ''`. Reset will 404 from the backend — the UI toasts the error via the default fetcher's `throwOnError`. That's acceptable UX for an edge case; if it becomes common we'll add a "this key is orphaned" badge in a follow-up.
- The old "override" concept is gone from the UI — every row is a first-class row in DB. The only hint of "unedited vs edited" is the value displayed vs the Default helper text.
- `useDeleteSiteContent` is fully removed after Step 1. Verify no other caller by grepping.
