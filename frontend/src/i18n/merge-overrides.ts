import type { SiteContentEntry } from '@repo/shared';

export type NestedRecord = { [key: string]: string | NestedRecord };

function flattenKeys(obj: NestedRecord, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else {
      Object.assign(result, flattenKeys(value, fullKey));
    }
  }
  return result;
}

function unflatten(flat: Record<string, string>): NestedRecord {
  const result: NestedRecord = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current: NestedRecord = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      if (!current[segment] || typeof current[segment] === 'string') {
        current[segment] = {};
      }
      current = current[segment] as NestedRecord;
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

export function mergeOverrides(
  defaults: NestedRecord,
  overrides: SiteContentEntry[],
  locale: 'zh' | 'en',
): NestedRecord {
  const flat = flattenKeys(defaults);
  for (const o of overrides) {
    const val = locale === 'zh' ? o.value_zh : o.value_en;
    if (val != null && val !== '') {
      flat[o.key] = val;
    }
  }
  return unflatten(flat);
}
