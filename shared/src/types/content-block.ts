export interface ContentBlock {
  id: string;
  title_zh: string;
  title_en: string | null;
  description_zh: string;
  description_en: string | null;
  image_url: string | null;
  position: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateContentBlockRequest {
  title_zh: string;
  title_en?: string | null;
  description_zh: string;
  description_en?: string | null;
  image_url?: string | null;
  is_published?: boolean;
}

export type UpdateContentBlockRequest = Partial<CreateContentBlockRequest>;

export interface ReorderContentBlocksRequest {
  ids: string[];
}

export interface ContentBlocksResponse {
  items: ContentBlock[];
}

export type AdminContentBlocksResponse = ContentBlocksResponse;
