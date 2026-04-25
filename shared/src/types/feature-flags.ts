import type { ShopSettings } from './shop-settings';

export interface FeatureFlagsResponse {
  homeVisibleCategoryIds: number[];
  shopSettings: ShopSettings;
}

export interface UpdateHomeVisibleCategoriesRequest {
  category_ids: number[];
}
