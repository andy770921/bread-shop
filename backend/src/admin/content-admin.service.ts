import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpsertSiteContentDto } from './dto/upsert-site-content.dto';
import { getDefaultForKey } from '../site-content/flatten';

@Injectable()
export class ContentAdminService {
  constructor(private supabase: SupabaseService) {}

  async getAll() {
    const { data, error } = await this.supabase
      .getClient()
      .from('site_content')
      .select('key, value_zh, value_en, updated_at, updated_by')
      .order('key', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return { overrides: data ?? [] };
  }

  async upsert(key: string, dto: UpsertSiteContentDto, userId: string) {
    const payload: Record<string, unknown> = { key, updated_by: userId };
    if (dto.value_zh !== undefined) payload.value_zh = dto.value_zh;
    if (dto.value_en !== undefined) payload.value_en = dto.value_en;

    const { data, error } = await this.supabase
      .getClient()
      .from('site_content')
      .upsert(payload, { onConflict: 'key' })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async resetToDefault(key: string, userId: string) {
    const fallback = getDefaultForKey(key);
    if (!fallback) {
      throw new NotFoundException(`No default value registered for key '${key}'.`);
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('site_content')
      .upsert(
        {
          key,
          value_zh: fallback.value_zh,
          value_en: fallback.value_en,
          updated_by: userId,
        },
        { onConflict: 'key' },
      )
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
