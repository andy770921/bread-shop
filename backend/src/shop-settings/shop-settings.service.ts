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
  inventory_mode: 'unlimited' | 'daily_total';
  daily_total_limit: number;
}

function rowToSettings(row: ShopSettingsRow): ShopSettings {
  return {
    shippingEnabled: row.shipping_enabled,
    shippingFee: row.shipping_fee,
    freeShippingThreshold: row.free_shipping_threshold,
    promoBannerEnabled: row.promo_banner_enabled,
    inventoryMode: row.inventory_mode,
    dailyTotalLimit: row.daily_total_limit,
  };
}

@Injectable()
export class ShopSettingsService {
  private cache: { value: ShopSettings; expiresAt: number } | null = null;

  constructor(private supabase: SupabaseService) {}

  async getSettings(): Promise<ShopSettings> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;
    const settings = await this.fetchFromDb();
    this.cache = { value: settings, expiresAt: now + CACHE_TTL_MS };
    return settings;
  }

  /**
   * Bypasses the 30s cache. Use only for the order-create capacity guard
   * (`InventoryService.assertHasCapacity`) where stale `dailyTotalLimit`
   * could let a freshly-lowered cap silently allow over-cap orders for up
   * to 30s. CartService.computeTotals continues to use the cached path.
   */
  async getSettingsFresh(): Promise<ShopSettings> {
    const settings = await this.fetchFromDb();
    this.cache = { value: settings, expiresAt: Date.now() + CACHE_TTL_MS };
    return settings;
  }

  private async fetchFromDb(): Promise<ShopSettings> {
    const { data, error } = await this.supabase
      .getClient()
      .from('shop_settings')
      .select(
        'shipping_enabled, shipping_fee, free_shipping_threshold, promo_banner_enabled, inventory_mode, daily_total_limit',
      )
      .eq('id', SETTINGS_ID)
      .single();
    if (error) throw new BadRequestException(error.message);
    return rowToSettings(data as ShopSettingsRow);
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
        inventory_mode: dto.inventoryMode,
        daily_total_limit: dto.dailyTotalLimit,
        updated_by: adminUserId,
      })
      .eq('id', SETTINGS_ID)
      .select(
        'shipping_enabled, shipping_fee, free_shipping_threshold, promo_banner_enabled, inventory_mode, daily_total_limit',
      )
      .single();
    if (error) throw new BadRequestException(error.message);
    const settings = rowToSettings(data as ShopSettingsRow);
    this.cache = { value: settings, expiresAt: Date.now() + CACHE_TTL_MS };
    return settings;
  }
}
