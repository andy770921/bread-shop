import { BadRequestException, Injectable } from '@nestjs/common';
import type { PickupAvailability } from '@repo/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { ShopSettingsService } from './shop-settings.service';

function ymdInTaipei(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

@Injectable()
export class InventoryService {
  constructor(
    private supabase: SupabaseService,
    private shopSettings: ShopSettingsService,
  ) {}

  async getDailyLoad(): Promise<Map<string, number>> {
    const { data, error } = await this.supabase.getClient().rpc('get_daily_pickup_load');
    if (error) throw new BadRequestException(error.message);
    const map = new Map<string, number>();
    for (const row of (data ?? []) as { pickup_date: string; total_quantity: number | string }[]) {
      map.set(row.pickup_date, Number(row.total_quantity));
    }
    return map;
  }

  async getAvailability(): Promise<PickupAvailability> {
    const settings = await this.shopSettings.getSettings();
    if (settings.inventoryMode === 'unlimited') {
      return { mode: 'unlimited', limit: null, fullDates: [] };
    }
    const load = await this.getDailyLoad();
    const limit = settings.dailyTotalLimit;
    const fullDates: string[] = [];
    for (const [date, qty] of load) {
      if (qty >= limit) fullDates.push(date);
    }
    fullDates.sort();
    return { mode: 'daily_total', limit, fullDates };
  }

  async assertHasCapacity(pickupAt: Date, additionalQuantity: number): Promise<void> {
    // Bypass the 30s cache so an admin lowering the cap takes effect on the
    // very next submit. Order creates are rare (single-digit/day) so the
    // extra SELECT cost is negligible compared to the correctness win.
    const settings = await this.shopSettings.getSettingsFresh();
    if (settings.inventoryMode === 'unlimited') return;
    const ymd = ymdInTaipei(pickupAt);
    const load = await this.getDailyLoad();
    const currentLoad = load.get(ymd) ?? 0;
    const limit = settings.dailyTotalLimit;
    if (currentLoad + additionalQuantity > limit) {
      throw new BadRequestException({
        code: 'daily_inventory_full',
        message: '此日期已額滿',
        date: ymd,
        limit,
        currentLoad,
      });
    }
  }
}
