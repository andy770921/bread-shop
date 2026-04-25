export type InventoryMode = 'unlimited' | 'daily_total';

export interface ShopSettings {
  shippingEnabled: boolean;
  shippingFee: number;
  freeShippingThreshold: number;
  promoBannerEnabled: boolean;
  inventoryMode: InventoryMode;
  dailyTotalLimit: number;
}

export type UpdateShopSettingsRequest = ShopSettings;
