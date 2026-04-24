import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  ContentBlock,
  ContentBlocksResponse,
  CreateContentBlockRequest,
  UpdateContentBlockRequest,
} from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { UpsertContentBlockDto } from './dto/upsert-content-block.dto';

function normalizeNullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() === '' ? null : value;
}

@Injectable()
export class ContentBlocksAdminService {
  constructor(private supabase: SupabaseService) {}

  async list(): Promise<ContentBlocksResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from('content_blocks')
      .select('*')
      .order('position', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return { items: (data ?? []) as ContentBlock[] };
  }

  async getById(id: string): Promise<ContentBlock> {
    const { data, error } = await this.supabase
      .getClient()
      .from('content_blocks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Content block ${id} not found`);
    return data as ContentBlock;
  }

  async create(dto: UpsertContentBlockDto): Promise<ContentBlock> {
    if (!dto.title_zh || !dto.title_zh.trim()) {
      throw new BadRequestException('title_zh is required');
    }
    if (!dto.description_zh || !dto.description_zh.trim()) {
      throw new BadRequestException('description_zh is required');
    }

    const { data: maxRow, error: maxErr } = await this.supabase
      .getClient()
      .from('content_blocks')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw new InternalServerErrorException(maxErr.message);

    const nextPosition = (maxRow?.position ?? -1) + 1;

    const payload: CreateContentBlockRequest & { position: number } = {
      title_zh: dto.title_zh.trim(),
      title_en: normalizeNullable(dto.title_en) ?? null,
      description_zh: dto.description_zh,
      description_en: normalizeNullable(dto.description_en) ?? null,
      image_url: normalizeNullable(dto.image_url) ?? null,
      is_published: dto.is_published ?? true,
      position: nextPosition,
    };

    const { data, error } = await this.supabase
      .getClient()
      .from('content_blocks')
      .insert(payload)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data as ContentBlock;
  }

  async update(id: string, dto: UpsertContentBlockDto): Promise<ContentBlock> {
    await this.getById(id);

    const payload: UpdateContentBlockRequest = {};
    if (dto.title_zh !== undefined) payload.title_zh = dto.title_zh;
    if (dto.title_en !== undefined) payload.title_en = normalizeNullable(dto.title_en) ?? null;
    if (dto.description_zh !== undefined) payload.description_zh = dto.description_zh;
    if (dto.description_en !== undefined)
      payload.description_en = normalizeNullable(dto.description_en) ?? null;
    if (dto.image_url !== undefined) payload.image_url = normalizeNullable(dto.image_url) ?? null;
    if (dto.is_published !== undefined) payload.is_published = dto.is_published;

    const { data, error } = await this.supabase
      .getClient()
      .from('content_blocks')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data as ContentBlock;
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    const { error } = await this.supabase
      .getClient()
      .from('content_blocks')
      .delete()
      .eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async reorder(ids: string[]): Promise<ContentBlocksResponse> {
    if (!ids.length) return this.list();

    const { data: existing, error: fetchErr } = await this.supabase
      .getClient()
      .from('content_blocks')
      .select('*')
      .in('id', ids);

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if ((existing?.length ?? 0) !== ids.length) {
      throw new NotFoundException('One or more content blocks not found');
    }

    const byId = new Map((existing as ContentBlock[]).map((row) => [row.id, row]));
    const updated = ids.map((id, idx) => ({ ...byId.get(id)!, position: idx }));

    const { error: upsertErr } = await this.supabase
      .getClient()
      .from('content_blocks')
      .upsert(updated, { onConflict: 'id' });

    if (upsertErr) throw new InternalServerErrorException(upsertErr.message);
    return this.list();
  }
}
