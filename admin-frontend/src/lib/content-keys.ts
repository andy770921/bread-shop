import zhDefaults from '@frontend-i18n/zh.json';
import enDefaults from '@frontend-i18n/en.json';

type NestedRecord = { [key: string]: string | NestedRecord };

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

export interface ContentKey {
  key: string;
  defaultZh: string;
  defaultEn: string;
}

export function getContentGroups(): Record<string, ContentKey[]> {
  const flatZh = flattenKeys(zhDefaults as NestedRecord);
  const flatEn = flattenKeys(enDefaults as NestedRecord);
  const groups: Record<string, ContentKey[]> = {};

  for (const key of Object.keys(flatZh)) {
    const section = key.split('.')[0] ?? 'misc';
    if (!groups[section]) groups[section] = [];
    groups[section].push({
      key,
      defaultZh: flatZh[key] ?? '',
      defaultEn: flatEn[key] ?? '',
    });
  }

  return groups;
}
