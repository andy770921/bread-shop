import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminHeroSlidesResponse,
  CreateHeroSlideRequest,
  HeroSlide,
  ReorderHeroSlidesRequest,
  UpdateHeroSlideRequest,
} from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

const KEY = ['api', 'admin', 'hero-slides'] as const;

export function useAdminHeroSlides() {
  return useQuery<AdminHeroSlidesResponse>({ queryKey: KEY });
}

export function useCreateHeroSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHeroSlideRequest) =>
      defaultFetchFn<HeroSlide, CreateHeroSlideRequest>('/api/admin/hero-slides', {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateHeroSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateHeroSlideRequest }) =>
      defaultFetchFn<HeroSlide, UpdateHeroSlideRequest>(`/api/admin/hero-slides/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteHeroSlide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      defaultFetchFn<void>(`/api/admin/hero-slides/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReorderHeroSlides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      defaultFetchFn<AdminHeroSlidesResponse, ReorderHeroSlidesRequest>(
        '/api/admin/hero-slides/reorder',
        { method: 'PATCH', body: { ids } },
      ),
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<AdminHeroSlidesResponse>(KEY);
      if (previous) {
        const byId = new Map(previous.items.map((b) => [b.id, b]));
        const next = {
          items: ids
            .map((id, idx) => {
              const row = byId.get(id);
              return row ? { ...row, position: idx } : undefined;
            })
            .filter((b): b is HeroSlide => !!b),
        };
        qc.setQueryData<AdminHeroSlidesResponse>(KEY, next);
      }
      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
