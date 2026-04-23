import { defaultContent, type NestedRecord } from '@repo/shared';

export interface FlatDefault {
  key: string;
  value_zh: string;
  value_en: string;
}

function flatten(obj: NestedRecord, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      result[fullKey] = v;
    } else {
      Object.assign(result, flatten(v, fullKey));
    }
  }
  return result;
}

export function getFlatDefaults(): FlatDefault[] {
  const zhMap = flatten(defaultContent.zh);
  const enMap = flatten(defaultContent.en);
  const keys = new Set([...Object.keys(zhMap), ...Object.keys(enMap)]);
  return [...keys].map((key) => ({
    key,
    value_zh: zhMap[key] ?? '',
    value_en: enMap[key] ?? '',
  }));
}

export function getDefaultForKey(key: string): FlatDefault | null {
  return getFlatDefaults().find((d) => d.key === key) ?? null;
}
