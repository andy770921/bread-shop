import type { InventoryMode } from './shop-settings';

export interface PickupAvailability {
  mode: InventoryMode;
  limit: number | null;
  fullDates: string[];
}
