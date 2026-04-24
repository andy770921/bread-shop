'use client';

import { useQuery } from '@tanstack/react-query';
import type { ContentBlocksResponse } from '@repo/shared';

export function useContentBlocks() {
  return useQuery<ContentBlocksResponse>({
    queryKey: ['api', 'content-blocks'],
  });
}
