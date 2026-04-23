import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContentAdminService } from './content-admin.service';
import type { SupabaseService } from '../supabase/supabase.service';

jest.mock('@repo/shared', () => ({
  defaultContent: {
    zh: { nav: { home: '首頁', about: '關於我們' } },
    en: { nav: { home: 'Home', about: 'About' } },
  },
}));

type UpsertResult = { data: Record<string, unknown> | null; error: { message: string } | null };

function makeSupabase(upsertResult: UpsertResult) {
  const single = jest.fn().mockResolvedValue(upsertResult);
  const select = jest.fn(() => ({ single }));
  const upsert = jest.fn(() => ({ select }));
  const from = jest.fn(() => ({ upsert }));
  const supabase = { getClient: () => ({ from }) } as unknown as SupabaseService;
  return { supabase, from, upsert, select, single };
}

describe('ContentAdminService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('upsert', () => {
    it('passes empty string through without coercion', async () => {
      const { supabase, upsert } = makeSupabase({
        data: { key: 'nav.home', value_zh: '', value_en: 'Home' },
        error: null,
      });
      const service = new ContentAdminService(supabase);

      await service.upsert('nav.home', { value_zh: '', value_en: 'Home' }, 'user-1');

      expect(upsert).toHaveBeenCalledWith(
        {
          key: 'nav.home',
          updated_by: 'user-1',
          value_zh: '',
          value_en: 'Home',
        },
        { onConflict: 'key' },
      );
    });

    it('omits undefined fields from the payload', async () => {
      const { supabase, upsert } = makeSupabase({
        data: { key: 'nav.home', value_zh: '主頁', value_en: 'Home' },
        error: null,
      });
      const service = new ContentAdminService(supabase);

      await service.upsert('nav.home', { value_zh: '主頁' }, 'user-1');

      const payload = (upsert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      expect(payload).toEqual({ key: 'nav.home', updated_by: 'user-1', value_zh: '主頁' });
      expect(payload).not.toHaveProperty('value_en');
    });

    it('throws BadRequestException when Supabase returns an error', async () => {
      const { supabase } = makeSupabase({ data: null, error: { message: 'db kaboom' } });
      const service = new ContentAdminService(supabase);

      await expect(service.upsert('nav.home', { value_zh: 'x' }, 'u')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('resetToDefault', () => {
    it('writes the JSON default values and the caller id back to the row', async () => {
      const { supabase, upsert } = makeSupabase({
        data: { key: 'nav.home', value_zh: '首頁', value_en: 'Home' },
        error: null,
      });
      const service = new ContentAdminService(supabase);

      const result = await service.resetToDefault('nav.home', 'user-42');

      expect(upsert).toHaveBeenCalledWith(
        {
          key: 'nav.home',
          value_zh: '首頁',
          value_en: 'Home',
          updated_by: 'user-42',
        },
        { onConflict: 'key' },
      );
      expect(result).toEqual({ key: 'nav.home', value_zh: '首頁', value_en: 'Home' });
    });

    it('throws NotFoundException when the key is not in the JSON defaults', async () => {
      const { supabase, upsert } = makeSupabase({ data: null, error: null });
      const service = new ContentAdminService(supabase);

      await expect(service.resetToDefault('orphan.key', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when Supabase returns an error', async () => {
      const { supabase } = makeSupabase({ data: null, error: { message: 'upsert fail' } });
      const service = new ContentAdminService(supabase);

      await expect(service.resetToDefault('nav.home', 'user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
