import { useMutation } from '@tanstack/react-query';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';
import type { UpdateProfileRequest, UserProfile } from '@repo/shared';

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) =>
      authedFetchFn<UserProfile>('api/user/profile', { method: 'PATCH', body }),
  });
}
