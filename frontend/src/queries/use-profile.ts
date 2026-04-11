import { useMutation } from '@tanstack/react-query';
import { authedFetchFn } from '@/utils/fetchers/fetchers.client';

interface UpdateProfileBody {
  name: string;
  phone: string;
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (body: UpdateProfileBody) =>
      authedFetchFn<any>('api/user/profile', { method: 'PATCH', body }),
  });
}
