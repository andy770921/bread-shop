import { BadRequestException, Injectable } from '@nestjs/common';
import type { ContentBlock, ContentBlocksResponse } from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ContentBlocksService {
  constructor(private supabase: SupabaseService) {}

  async listPublished(): Promise<ContentBlocksResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from('content_blocks')
      .select('*')
      .eq('is_published', true)
      .order('position', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return { items: (data ?? []) as ContentBlock[] };
  }
}
