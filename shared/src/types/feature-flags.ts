export interface FeatureFlagsResponse {
  homeVisibleCategoryIds: number[];
}

export interface UpdateHomeVisibleCategoriesRequest {
  category_ids: number[];
}
