import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class SiteContentService {
  constructor(private supabase: SupabaseService) {}

  async getAll() {
    const { data, error } = await this.supabase
      .getClient()
      .from('site_content')
      .select('key, value_zh, value_en, updated_at, updated_by');
    if (error) throw new BadRequestException(error.message);
    return { overrides: data ?? [] };
  }
}
