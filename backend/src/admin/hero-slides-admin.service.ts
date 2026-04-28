import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  HeroSlide,
  HeroSlidesResponse,
  UpdateHeroSlideRequest,
  CreateHeroSlideRequest,
} from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { UpsertHeroSlideDto } from './dto/upsert-hero-slide.dto';

function normalizeNullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() === '' ? null : value;
}

@Injectable()
export class HeroSlidesAdminService {
  constructor(private supabase: SupabaseService) {}

  async list(): Promise<HeroSlidesResponse> {
    const { data, error } = await this.supabase
      .getClient()
      .from('hero_slides')
      .select('*')
      .order('position', { ascending: true });

    if (error) throw new InternalServerErrorException(error.message);
    return { items: (data ?? []) as HeroSlide[] };
  }

  async getById(id: string): Promise<HeroSlide> {
    const { data, error } = await this.supabase
      .getClient()
      .from('hero_slides')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Hero slide ${id} not found`);
    return data as HeroSlide;
  }

  async create(dto: UpsertHeroSlideDto): Promise<HeroSlide> {
    if (!dto.title_zh || !dto.title_zh.trim()) {
      throw new BadRequestException('title_zh is required');
    }
    if (!dto.subtitle_zh || !dto.subtitle_zh.trim()) {
      throw new BadRequestException('subtitle_zh is required');
    }
    if (!dto.image_url || !dto.image_url.trim()) {
      throw new BadRequestException('image_url is required');
    }

    const { data: maxRow, error: maxErr } = await this.supabase
      .getClient()
      .from('hero_slides')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw new InternalServerErrorException(maxErr.message);

    const nextPosition = (maxRow?.position ?? -1) + 1;

    const payload: CreateHeroSlideRequest & { position: number } = {
      title_zh: dto.title_zh.trim(),
      title_en: normalizeNullable(dto.title_en) ?? null,
      subtitle_zh: dto.subtitle_zh,
      subtitle_en: normalizeNullable(dto.subtitle_en) ?? null,
      image_url: dto.image_url.trim(),
      is_published: dto.is_published ?? true,
      position: nextPosition,
      ...(dto.title_size !== undefined ? { title_size: dto.title_size } : {}),
      ...(dto.subtitle_size !== undefined ? { subtitle_size: dto.subtitle_size } : {}),
    };

    const { data, error } = await this.supabase
      .getClient()
      .from('hero_slides')
      .insert(payload)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data as HeroSlide;
  }

  async update(id: string, dto: UpsertHeroSlideDto): Promise<HeroSlide> {
    await this.getById(id);

    const payload: UpdateHeroSlideRequest = {};
    if (dto.title_zh !== undefined) payload.title_zh = dto.title_zh;
    if (dto.title_en !== undefined) payload.title_en = normalizeNullable(dto.title_en) ?? null;
    if (dto.subtitle_zh !== undefined) payload.subtitle_zh = dto.subtitle_zh;
    if (dto.subtitle_en !== undefined)
      payload.subtitle_en = normalizeNullable(dto.subtitle_en) ?? null;
    if (dto.image_url !== undefined) {
      if (!dto.image_url.trim()) throw new BadRequestException('image_url cannot be empty');
      payload.image_url = dto.image_url.trim();
    }
    if (dto.is_published !== undefined) payload.is_published = dto.is_published;
    if (dto.title_size !== undefined) payload.title_size = dto.title_size;
    if (dto.subtitle_size !== undefined) payload.subtitle_size = dto.subtitle_size;

    const { data, error } = await this.supabase
      .getClient()
      .from('hero_slides')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data as HeroSlide;
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    const { error } = await this.supabase.getClient().from('hero_slides').delete().eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async reorder(ids: string[]): Promise<HeroSlidesResponse> {
    if (!ids.length) return this.list();

    const { data: existing, error: fetchErr } = await this.supabase
      .getClient()
      .from('hero_slides')
      .select('*')
      .in('id', ids);

    if (fetchErr) throw new InternalServerErrorException(fetchErr.message);
    if ((existing?.length ?? 0) !== ids.length) {
      throw new NotFoundException('One or more hero slides not found');
    }

    const byId = new Map((existing as HeroSlide[]).map((row) => [row.id, row]));
    const updated = ids.map((id, idx) => ({ ...byId.get(id)!, position: idx }));

    const { error: upsertErr } = await this.supabase
      .getClient()
      .from('hero_slides')
      .upsert(updated, { onConflict: 'id' });

    if (upsertErr) throw new InternalServerErrorException(upsertErr.message);
    return this.list();
  }
}
