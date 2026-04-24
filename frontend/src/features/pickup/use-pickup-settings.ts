'use client';

import { useQuery } from '@tanstack/react-query';
import type { PickupSettingsResponse } from '@repo/shared';

export function usePickupSettings() {
  return useQuery<PickupSettingsResponse>({
    queryKey: ['api', 'pickup-settings'],
  });
}
