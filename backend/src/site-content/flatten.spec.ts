import { getFlatDefaults, getDefaultForKey } from './flatten';

jest.mock('@repo/shared', () => ({
  defaultContent: {
    zh: {
      nav: { home: '首頁', about: '關於我們' },
      home: { hero: { title: '手工烘焙' } },
      empty: { zhOnly: '只有中文' },
    },
    en: {
      nav: { home: 'Home', about: 'About' },
      home: { hero: { title: 'Handcrafted bread' } },
      empty: { enOnly: 'English only' },
    },
  },
}));

describe('flatten helpers', () => {
  describe('getFlatDefaults', () => {
    it('flattens nested locale objects to dot-notation keys', () => {
      const flat = getFlatDefaults();
      const keys = flat.map((f) => f.key).sort();
      expect(keys).toEqual([
        'empty.enOnly',
        'empty.zhOnly',
        'home.hero.title',
        'nav.about',
        'nav.home',
      ]);
    });

    it('pairs zh and en values on matching keys', () => {
      const flat = getFlatDefaults();
      const navHome = flat.find((f) => f.key === 'nav.home');
      expect(navHome).toEqual({ key: 'nav.home', value_zh: '首頁', value_en: 'Home' });
    });

    it('defaults missing values to empty string when one locale lacks the key', () => {
      const flat = getFlatDefaults();
      const zhOnly = flat.find((f) => f.key === 'empty.zhOnly');
      const enOnly = flat.find((f) => f.key === 'empty.enOnly');
      expect(zhOnly).toEqual({ key: 'empty.zhOnly', value_zh: '只有中文', value_en: '' });
      expect(enOnly).toEqual({ key: 'empty.enOnly', value_zh: '', value_en: 'English only' });
    });
  });

  describe('getDefaultForKey', () => {
    it('returns the paired default for a known key', () => {
      expect(getDefaultForKey('nav.home')).toEqual({
        key: 'nav.home',
        value_zh: '首頁',
        value_en: 'Home',
      });
    });

    it('returns null for an unknown key', () => {
      expect(getDefaultForKey('does.not.exist')).toBeNull();
    });
  });
});
