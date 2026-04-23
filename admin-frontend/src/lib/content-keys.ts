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
