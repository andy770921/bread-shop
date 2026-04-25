import { useQuery } from '@tanstack/react-query';
import type { PickupAvailability } from '@repo/shared';

export const PICKUP_AVAILABILITY_KEY = ['api', 'pickup-availability'] as const;

export function usePickupAvailability() {
  return useQuery<PickupAvailability>({
    queryKey: PICKUP_AVAILABILITY_KEY,
    staleTime: 60_000,
  });
}
