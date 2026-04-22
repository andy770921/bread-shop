export interface SiteContentEntry {
  key: string;
  value_zh: string | null;
  value_en: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface SiteContentResponse {
  overrides: SiteContentEntry[];
}

export interface UpdateSiteContentRequest {
  value_zh?: string | null;
  value_en?: string | null;
}
