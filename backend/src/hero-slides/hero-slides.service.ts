import { BadRequestException, Injectable } from '@nestjs/common';
import type { HeroSlide, HeroSlidesResponse } from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class HeroSlidesService {
  constructor(private supabase: SupabaseService) {}

  async listPublished(): Promise<HeroSlidesResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from('hero_slides')
      .select('*')
      .eq('is_published', true)
      .order('position', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return { items: (data ?? []) as HeroSlide[] };
  }
}
