import { mergeOverrides } from './merge-overrides';
import type { SiteContentEntry } from '@repo/shared';

const defaults = {
  nav: { home: '首頁', about: '關於我們' },
  home: { hero: { title: '手工烘焙' } },
};

function entry(key: string, zh: string | null, en: string | null): SiteContentEntry {
  return { key, value_zh: zh, value_en: en, updated_at: '', updated_by: null };
}

describe('mergeOverrides', () => {
  it('replaces the default with the override value when present', () => {
    const result = mergeOverrides(defaults, [entry('nav.home', '主頁', 'Main')], 'zh');
    expect(result).toEqual({
      nav: { home: '主頁', about: '關於我們' },
      home: { hero: { title: '手工烘焙' } },
    });
  });

  it('uses the English value when locale is en', () => {
    const result = mergeOverrides(defaults, [entry('nav.home', '主頁', 'Main')], 'en');
    expect((result.nav as Record<string, string>).home).toBe('Main');
  });

  it('honors an empty-string override as a deliberate blank (not fallback)', () => {
    const result = mergeOverrides(defaults, [entry('nav.home', '', '')], 'zh');
    expect((result.nav as Record<string, string>).home).toBe('');
  });

  it('falls back to the default when the override is null', () => {
    const result = mergeOverrides(defaults, [entry('nav.home', null, null)], 'zh');
    expect((result.nav as Record<string, string>).home).toBe('首頁');
  });

  it('leaves unrelated keys untouched', () => {
    const result = mergeOverrides(defaults, [entry('nav.home', '主頁', 'Main')], 'zh');
    expect((result.nav as Record<string, string>).about).toBe('關於我們');
    expect(((result.home as Record<string, unknown>).hero as Record<string, string>).title).toBe(
      '手工烘焙',
    );
  });

  it('preserves nested structure when overriding a deep key', () => {
    const result = mergeOverrides(
      defaults,
      [entry('home.hero.title', '新標題', 'New title')],
      'zh',
    );
    expect(result).toEqual({
      nav: { home: '首頁', about: '關於我們' },
      home: { hero: { title: '新標題' } },
    });
  });
});
