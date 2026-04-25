export interface ShopSettings {
  shippingEnabled: boolean;
  shippingFee: number;
  freeShippingThreshold: number;
  promoBannerEnabled: boolean;
}

export type UpdateShopSettingsRequest = ShopSettings;
