import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class FeatureFlagsAdminService {
  constructor(private supabase: SupabaseService) {}

  async get() {
    const supabase = this.supabase.getClient();
    const { data, error } = await supabase
      .from('categories')
      .select('id')
      .eq('visible_on_home', true);
    if (error) throw new BadRequestException(error.message);
    return { homeVisibleCategoryIds: (data ?? []).map((r) => r.id as number) };
  }

  async replaceHomeVisibleCategories(categoryIds: number[]) {
    const supabase = this.supabase.getClient();

    const { data: existing, error: existingErr } = await supabase.from('categories').select('id');
    if (existingErr) throw new BadRequestException(existingErr.message);
    const known = new Set((existing ?? []).map((r) => r.id as number));
    const unknown = categoryIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown category ids: ${unknown.join(', ')}`);
    }

    const { error: onErr } = await supabase
      .from('categories')
      .update({ visible_on_home: true })
      .in('id', categoryIds);
    if (onErr) throw new BadRequestException(onErr.message);

    const { error: offErr } = await supabase
      .from('categories')
      .update({ visible_on_home: false })
      .not('id', 'in', `(${categoryIds.join(',')})`);
    if (offErr) throw new BadRequestException(offErr.message);

    return this.get();
  }
}
