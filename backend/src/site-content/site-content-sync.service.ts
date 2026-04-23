import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { getFlatDefaults } from './flatten';

@Injectable()
export class SiteContentSyncService implements OnModuleInit {
  private readonly logger = new Logger(SiteContentSyncService.name);

  constructor(private supabase: SupabaseService) {}

  async onModuleInit() {
    await this.syncMissingKeys();
  }

  async syncMissingKeys(): Promise<{ inserted: number; skipped: number }> {
    try {
      const defaults = getFlatDefaults();
      const client = this.supabase.getClient();

      const { data: existing, error: selectError } = await client
        .from('site_content')
        .select('key');
      if (selectError) {
        this.logger.error(`Site content sync failed to list keys: ${selectError.message}`);
        return { inserted: 0, skipped: 0 };
      }

      const existingKeys = new Set((existing ?? []).map((row) => row.key));
      const missing = defaults.filter((d) => !existingKeys.has(d.key));

      if (missing.length === 0) {
        this.logger.log(`Site content sync: all ${defaults.length} keys already present.`);
        return { inserted: 0, skipped: defaults.length };
      }

      const rows = missing.map((d) => ({
        key: d.key,
        value_zh: d.value_zh,
        value_en: d.value_en,
        updated_by: null,
      }));

      const { error: insertError } = await client.from('site_content').insert(rows);
      if (insertError) {
        this.logger.error(`Site content sync failed to insert: ${insertError.message}`);
        return { inserted: 0, skipped: defaults.length };
      }

      this.logger.log(
        `Site content sync: inserted ${missing.length} missing keys (${defaults.length - missing.length} already present).`,
      );
      return { inserted: missing.length, skipped: defaults.length - missing.length };
    } catch (err) {
      this.logger.error(`Site content sync crashed: ${(err as Error).message}`);
      return { inserted: 0, skipped: 0 };
    }
  }
}
