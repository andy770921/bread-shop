export type HeroSlideTextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const HERO_SLIDE_TEXT_SIZES: readonly HeroSlideTextSize[] = [
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
] as const;

export interface HeroSlide {
  id: string;
  title_zh: string;
  title_en: string | null;
  subtitle_zh: string;
  subtitle_en: string | null;
  image_url: string;
  position: number;
  is_published: boolean;
  title_size: HeroSlideTextSize;
  subtitle_size: HeroSlideTextSize;
  created_at: string;
  updated_at: string;
}

export interface CreateHeroSlideRequest {
  title_zh: string;
  title_en?: string | null;
  subtitle_zh: string;
  subtitle_en?: string | null;
  image_url: string;
  is_published?: boolean;
  title_size?: HeroSlideTextSize;
  subtitle_size?: HeroSlideTextSize;
}

export type UpdateHeroSlideRequest = Partial<CreateHeroSlideRequest>;

export interface ReorderHeroSlidesRequest {
  ids: string[];
}

export interface HeroSlidesResponse {
  items: HeroSlide[];
}

export type AdminHeroSlidesResponse = HeroSlidesResponse;
