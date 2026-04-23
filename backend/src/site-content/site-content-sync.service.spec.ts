import { Logger } from '@nestjs/common';
import { SiteContentSyncService } from './site-content-sync.service';
import type { SupabaseService } from '../supabase/supabase.service';

jest.mock('@repo/shared', () => ({
  defaultContent: {
    zh: { nav: { home: '首頁', about: '關於我們' }, home: { hero: '標題' } },
    en: { nav: { home: 'Home', about: 'About' }, home: { hero: 'Title' } },
  },
}));

type SelectResult = { data: { key: string }[] | null; error: { message: string } | null };
type InsertResult = { error: { message: string } | null };

function makeSupabase(selectResult: SelectResult, insertResult: InsertResult = { error: null }) {
  const insert = jest.fn().mockResolvedValue(insertResult);
  const select = jest.fn().mockResolvedValue(selectResult);
  const from = jest.fn(() => ({ select, insert }));
  const client = { from } as const;
  const supabase = { getClient: () => client } as unknown as SupabaseService;
  return { supabase, from, select, insert };
}

describe('SiteContentSyncService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('inserts every flat default when the table is empty', async () => {
    const { supabase, insert, from } = makeSupabase({ data: [], error: null });
    const service = new SiteContentSyncService(supabase);

    const result = await service.syncMissingKeys();

    expect(result).toEqual({ inserted: 3, skipped: 0 });
    expect(from).toHaveBeenCalledWith('site_content');
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0] as Array<{
      key: string;
      value_zh: string;
      value_en: string;
    }>;
    expect(rows.map((r) => r.key).sort()).toEqual(['home.hero', 'nav.about', 'nav.home']);
    const navHome = rows.find((r) => r.key === 'nav.home');
    expect(navHome).toEqual({
      key: 'nav.home',
      value_zh: '首頁',
      value_en: 'Home',
      updated_by: null,
    });
  });

  it('skips insert entirely when every key is already present', async () => {
    const { supabase, insert } = makeSupabase({
      data: [{ key: 'nav.home' }, { key: 'nav.about' }, { key: 'home.hero' }],
      error: null,
    });
    const service = new SiteContentSyncService(supabase);

    const result = await service.syncMissingKeys();

    expect(result).toEqual({ inserted: 0, skipped: 3 });
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts only the missing keys, preserving any operator-edited rows', async () => {
    const { supabase, insert } = makeSupabase({
      data: [{ key: 'nav.home' }],
      error: null,
    });
    const service = new SiteContentSyncService(supabase);

    const result = await service.syncMissingKeys();

    expect(result).toEqual({ inserted: 2, skipped: 1 });
    const rows = insert.mock.calls[0][0] as Array<{ key: string }>;
    expect(rows.map((r) => r.key).sort()).toEqual(['home.hero', 'nav.about']);
    expect(rows.some((r) => r.key === 'nav.home')).toBe(false);
  });

  it('logs and returns safely when the select query errors', async () => {
    const { supabase, insert } = makeSupabase({ data: null, error: { message: 'select fail' } });
    const service = new SiteContentSyncService(supabase);

    const result = await service.syncMissingKeys();

    expect(result).toEqual({ inserted: 0, skipped: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  it('logs and returns safely when the insert query errors', async () => {
    const { supabase, insert } = makeSupabase(
      { data: [], error: null },
      { error: { message: 'insert fail' } },
    );
    const service = new SiteContentSyncService(supabase);

    const result = await service.syncMissingKeys();

    expect(result).toEqual({ inserted: 0, skipped: 3 });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('invokes syncMissingKeys from onModuleInit', async () => {
    const { supabase } = makeSupabase({ data: [], error: null });
    const service = new SiteContentSyncService(supabase);
    const spy = jest
      .spyOn(service, 'syncMissingKeys')
      .mockResolvedValue({ inserted: 0, skipped: 0 });

    await service.onModuleInit();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
