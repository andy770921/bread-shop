import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpsertSiteContentDto } from './dto/upsert-site-content.dto';

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

  async remove(key: string) {
    const { error } = await this.supabase.getClient().from('site_content').delete().eq('key', key);
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }
}
