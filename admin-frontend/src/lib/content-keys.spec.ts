import { describe, it, expect, vi } from 'vitest';

vi.mock('@repo/shared', () => ({
  defaultContent: {
    zh: { nav: { home: '首頁', about: '關於我們' }, home: { hero: { title: '手工烘焙' } } },
    en: { nav: { home: 'Home', about: 'About' }, home: { hero: { title: 'Handcrafted' } } },
  },
}));

import { groupRowsBySection, getDefault } from './content-keys';
import type { SiteContentEntry } from '@repo/shared';

function entry(key: string, zh: string | null, en: string | null): SiteContentEntry {
  return { key, value_zh: zh, value_en: en, updated_at: '', updated_by: null };
}

describe('content-keys helpers', () => {
  describe('getDefault', () => {
    it('returns paired defaults for a known key', () => {
      expect(getDefault('nav.home')).toEqual({ zh: '首頁', en: 'Home' });
    });

    it('returns empty strings for an unknown key', () => {
      expect(getDefault('does.not.exist')).toEqual({ zh: '', en: '' });
    });
  });

  describe('groupRowsBySection', () => {
    it('groups rows by the dot-prefix and sorts within each group', () => {
      const groups = groupRowsBySection([
        entry('nav.home', '主頁', 'Main'),
        entry('home.hero.title', '新標題', 'New title'),
        entry('nav.about', '關於', 'About Us'),
      ]);

      expect(Object.keys(groups).sort()).toEqual(['home', 'nav']);
      expect(groups.nav.map((r) => r.key)).toEqual(['nav.about', 'nav.home']);
      expect(groups.home.map((r) => r.key)).toEqual(['home.hero.title']);
    });

    it('attaches the JSON default to each row for the reset target and helper label', () => {
      const groups = groupRowsBySection([entry('nav.home', '主頁', 'Main')]);
      expect(groups.nav[0]).toEqual({
        key: 'nav.home',
        value_zh: '主頁',
        value_en: 'Main',
        default_zh: '首頁',
        default_en: 'Home',
      });
    });

    it('coerces null DB values to empty strings so React inputs render controlled', () => {
      const groups = groupRowsBySection([entry('nav.home', null, null)]);
      expect(groups.nav[0].value_zh).toBe('');
      expect(groups.nav[0].value_en).toBe('');
    });

    it('keeps orphan keys (not in JSON) with empty default strings', () => {
      const groups = groupRowsBySection([entry('orphan.key', '孤兒', 'Orphan')]);
      expect(groups.orphan[0]).toEqual({
        key: 'orphan.key',
        value_zh: '孤兒',
        value_en: 'Orphan',
        default_zh: '',
        default_en: '',
      });
    });

    it('returns an empty object when there are no entries', () => {
      expect(groupRowsBySection([])).toEqual({});
    });
  });
});
