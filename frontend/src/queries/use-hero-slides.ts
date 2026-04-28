import { useQuery } from '@tanstack/react-query';
import type { HeroSlidesResponse } from '@repo/shared';

export function useHeroSlides() {
  return useQuery<HeroSlidesResponse>({ queryKey: ['api', 'hero-slides'] });
}
