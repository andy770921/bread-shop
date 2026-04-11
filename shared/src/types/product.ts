export interface ProductSpec {
  label_zh: string;
  label_en: string;
  value_zh: string;
  value_en: string;
}

export type BadgeType = 'hot' | 'new' | 'seasonal';

export interface Product {
  id: number;
  category_id: number;
  name_zh: string;
  name_en: string;
  description_zh: string | null;
  description_en: string | null;
  price: number;
  image_url: string | null;
  badge_type: BadgeType | null;
  badge_text_zh: string | null;
  badge_text_en: string | null;
  specs: ProductSpec[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductWithCategory extends Product {
  category: Category;
}

export interface Category {
  id: number;
  slug: string;
  name_zh: string;
  name_en: string;
  sort_order: number;
  created_at: string;
}

export interface ProductListParams {
  category?: string;
}

export interface ProductListResponse {
  products: ProductWithCategory[];
}

export interface CategoryListResponse {
  categories: Category[];
}
