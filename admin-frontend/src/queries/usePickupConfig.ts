import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePickupLocationRequest,
  PickupLocation,
  PickupSettings,
  PickupSettingsResponse,
  UpdatePickupLocationRequest,
  UpdatePickupSettingsRequest,
} from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

const SETTINGS_KEY = ['api', 'admin', 'pickup-settings'] as const;
const LOCATIONS_KEY = ['api', 'admin', 'pickup-locations'] as const;

export function useAdminPickupSettings() {
  return useQuery<PickupSettingsResponse>({ queryKey: SETTINGS_KEY });
}

export function useAdminPickupLocations() {
  return useQuery<PickupLocation[]>({ queryKey: LOCATIONS_KEY });
}

export function useUpdatePickupSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePickupSettingsRequest) =>
      defaultFetchFn<PickupSettings, UpdatePickupSettingsRequest>('/api/admin/pickup-settings', {
        method: 'PUT',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}

export function useCreatePickupLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePickupLocationRequest) =>
      defaultFetchFn<PickupLocation, CreatePickupLocationRequest>('/api/admin/pickup-locations', {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}

export function useUpdatePickupLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePickupLocationRequest }) =>
      defaultFetchFn<PickupLocation, UpdatePickupLocationRequest>(
        `/api/admin/pickup-locations/${id}`,
        { method: 'PATCH', body },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}

export function useDeletePickupLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      defaultFetchFn<void>(`/api/admin/pickup-locations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}
