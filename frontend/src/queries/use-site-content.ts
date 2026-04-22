import { useQuery } from '@tanstack/react-query';
import type { SiteContentResponse } from '@repo/shared';

export function useSiteContent() {
  return useQuery<SiteContentResponse>({
    queryKey: ['api', 'site-content'],
    staleTime: 5 * 60 * 1000,
  });
}
