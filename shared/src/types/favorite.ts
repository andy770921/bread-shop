export interface Favorite {
  id: number;
  user_id: string;
  product_id: number;
  created_at: string;
}

export interface FavoriteListResponse {
  product_ids: number[];
}
