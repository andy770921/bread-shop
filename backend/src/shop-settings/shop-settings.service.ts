import { BadRequestException, Injectable } from '@nestjs/common';
import type { ShopSettings, UpdateShopSettingsRequest } from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';

const SETTINGS_ID = 1;
const CACHE_TTL_MS = 30_000;

interface ShopSettingsRow {
  shipping_enabled: boolean;
  shipping_fee: number;
  free_shipping_threshold: number;
  promo_banner_enabled: boolean;
}

function rowToSettings(row: ShopSettingsRow): ShopSettings {
  return {
    shippingEnabled: row.shipping_enabled,
    shippingFee: row.shipping_fee,
    freeShippingThreshold: row.free_shipping_threshold,
    promoBannerEnabled: row.promo_banner_enabled,
  };
}

@Injectable()
export class ShopSettingsService {
  private cache: { value: ShopSettings; expiresAt: number } | null = null;

  constructor(private supabase: SupabaseService) {}

  async getSettings(): Promise<ShopSettings> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;

    const { data, error } = await this.supabase
      .getClient()
      .from('shop_settings')
      .select('shipping_enabled, shipping_fee, free_shipping_threshold, promo_banner_enabled')
      .eq('id', SETTINGS_ID)
      .single();
    if (error) throw new BadRequestException(error.message);
    const settings = rowToSettings(data as ShopSettingsRow);
    this.cache = { value: settings, expiresAt: now + CACHE_TTL_MS };
    return settings;
  }

  async updateSettings(dto: UpdateShopSettingsRequest, adminUserId: string): Promise<ShopSettings> {
    const { data, error } = await this.supabase
      .getClient()
      .from('shop_settings')
      .update({
        shipping_enabled: dto.shippingEnabled,
        shipping_fee: dto.shippingFee,
        free_shipping_threshold: dto.freeShippingThreshold,
        promo_banner_enabled: dto.promoBannerEnabled,
        updated_by: adminUserId,
      })
      .eq('id', SETTINGS_ID)
      .select('shipping_enabled, shipping_fee, free_shipping_threshold, promo_banner_enabled')
      .single();
    if (error) throw new BadRequestException(error.message);
    const settings = rowToSettings(data as ShopSettingsRow);
    this.cache = { value: settings, expiresAt: Date.now() + CACHE_TTL_MS };
    return settings;
  }
}
