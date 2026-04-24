import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  PickupLocation,
  PickupSettings,
  PickupSettingsResponse,
  UpdatePickupSettingsRequest,
} from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePickupLocationDto } from './dto/create-pickup-location.dto';
import { UpdatePickupLocationDto } from './dto/update-pickup-location.dto';

const SETTINGS_ID = 1;

interface PickupSettingsRow {
  id: number;
  time_slots: string[];
  window_days: number;
  disabled_weekdays: number[];
  closure_start_date: string | null;
  closure_end_date: string | null;
  updated_by?: string | null;
  updated_at?: string;
}

function rowToSettings(row: PickupSettingsRow): PickupSettings {
  return {
    timeSlots: row.time_slots ?? [],
    windowDays: row.window_days,
    disabledWeekdays: row.disabled_weekdays ?? [],
    closureStartDate: row.closure_start_date,
    closureEndDate: row.closure_end_date,
  };
}

function sanitizeLocation(raw: any): PickupLocation {
  return {
    id: raw.id,
    label_zh: raw.label_zh,
    label_en: raw.label_en,
    sort_order: raw.sort_order,
    is_active: raw.is_active,
  };
}

@Injectable()
export class PickupService {
  constructor(private supabase: SupabaseService) {}

  async getPublicSettings(): Promise<PickupSettingsResponse> {
    const [settings, locations] = await Promise.all([
      this.readSettings(),
      this.listLocations({ includeInactive: false }),
    ]);
    return {
      ...settings,
      locations: locations.map((l) => ({
        id: l.id,
        label_zh: l.label_zh,
        label_en: l.label_en,
      })),
    };
  }

  async getAdminSettings(): Promise<PickupSettingsResponse> {
    const [settings, locations] = await Promise.all([
      this.readSettings(),
      this.listLocations({ includeInactive: true }),
    ]);
    return { ...settings, locations };
  }

  async updateSettings(
    dto: UpdatePickupSettingsRequest,
    adminUserId: string,
  ): Promise<PickupSettings> {
    const uniqueSlots = Array.from(new Set(dto.timeSlots)).sort();
    const uniqueWeekdays = Array.from(new Set(dto.disabledWeekdays)).sort();

    const closureStart = dto.closureStartDate ?? null;
    const closureEnd = dto.closureEndDate ?? null;
    if ((closureStart && !closureEnd) || (!closureStart && closureEnd)) {
      throw new BadRequestException('closure_range_partial');
    }
    if (closureStart && closureEnd && closureEnd < closureStart) {
      throw new BadRequestException('closure_range_inverted');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('pickup_settings')
      .update({
        time_slots: uniqueSlots,
        window_days: dto.windowDays,
        disabled_weekdays: uniqueWeekdays,
        closure_start_date: closureStart,
        closure_end_date: closureEnd,
        updated_by: adminUserId,
      })
      .eq('id', SETTINGS_ID)
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return rowToSettings(data as PickupSettingsRow);
  }

  async listLocations(params?: { includeInactive?: boolean }): Promise<PickupLocation[]> {
    let query = this.supabase
      .getClient()
      .from('pickup_locations')
      .select('id, label_zh, label_en, sort_order, is_active')
      .order('sort_order', { ascending: true });
    if (!params?.includeInactive) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map(sanitizeLocation);
  }

  async createLocation(dto: CreatePickupLocationDto): Promise<PickupLocation> {
    const zh = dto.label_zh.trim();
    const en = dto.label_en.trim();
    if (!zh || !en) throw new BadRequestException('label_required');

    const { data, error } = await this.supabase
      .getClient()
      .from('pickup_locations')
      .insert({ label_zh: zh, label_en: en })
      .select('id, label_zh, label_en, sort_order, is_active')
      .single();
    if (error) throw new BadRequestException(error.message);
    return sanitizeLocation(data);
  }

  async updateLocation(id: string, dto: UpdatePickupLocationDto): Promise<PickupLocation> {
    const payload: Record<string, unknown> = {};
    if (dto.label_zh !== undefined) {
      const trimmed = dto.label_zh.trim();
      if (!trimmed) throw new BadRequestException('label_required');
      payload.label_zh = trimmed;
    }
    if (dto.label_en !== undefined) {
      const trimmed = dto.label_en.trim();
      if (!trimmed) throw new BadRequestException('label_required');
      payload.label_en = trimmed;
    }
    if (dto.is_active !== undefined) payload.is_active = dto.is_active;
    if (dto.sort_order !== undefined) payload.sort_order = dto.sort_order;

    if (payload.is_active === false) {
      await this.assertNotLastActive(id);
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('pickup_locations')
      .update(payload)
      .eq('id', id)
      .select('id, label_zh, label_en, sort_order, is_active')
      .single();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Pickup location not found');
    return sanitizeLocation(data);
  }

  async softDeleteLocation(id: string): Promise<void> {
    await this.assertNotLastActive(id);
    const { error } = await this.supabase
      .getClient()
      .from('pickup_locations')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }

  async loadValidationBundle(): Promise<{
    settings: PickupSettings;
    locations: Pick<PickupLocation, 'id' | 'is_active'>[];
  }> {
    const [settings, locations] = await Promise.all([
      this.readSettings(),
      this.listLocations({ includeInactive: true }),
    ]);
    return {
      settings,
      locations: locations.map((l) => ({ id: l.id, is_active: l.is_active })),
    };
  }

  private async readSettings(): Promise<PickupSettings> {
    const { data, error } = await this.supabase
      .getClient()
      .from('pickup_settings')
      .select('time_slots, window_days, disabled_weekdays, closure_start_date, closure_end_date')
      .eq('id', SETTINGS_ID)
      .single();
    if (error) throw new BadRequestException(error.message);
    return rowToSettings(data as PickupSettingsRow);
  }

  private async assertNotLastActive(id: string): Promise<void> {
    const { count, error } = await this.supabase
      .getClient()
      .from('pickup_locations')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('id', id);
    if (error) throw new BadRequestException(error.message);
    if ((count ?? 0) === 0) {
      throw new BadRequestException('cannot_delete_last_active_location');
    }
  }
}
