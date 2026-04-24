import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminContentBlocksResponse,
  ContentBlock,
  CreateContentBlockRequest,
  ReorderContentBlocksRequest,
  UpdateContentBlockRequest,
} from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

const KEY = ['api', 'admin', 'content-blocks'] as const;

export function useAdminContentBlocks() {
  return useQuery<AdminContentBlocksResponse>({ queryKey: KEY });
}

export function useCreateContentBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateContentBlockRequest) =>
      defaultFetchFn<ContentBlock, CreateContentBlockRequest>('/api/admin/content-blocks', {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateContentBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateContentBlockRequest }) =>
      defaultFetchFn<ContentBlock, UpdateContentBlockRequest>(`/api/admin/content-blocks/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteContentBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      defaultFetchFn<void>(`/api/admin/content-blocks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReorderContentBlocks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      defaultFetchFn<AdminContentBlocksResponse, ReorderContentBlocksRequest>(
        '/api/admin/content-blocks/reorder',
        { method: 'PATCH', body: { ids } },
      ),
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<AdminContentBlocksResponse>(KEY);
      if (previous) {
        const byId = new Map(previous.items.map((b) => [b.id, b]));
        const next = {
          items: ids
            .map((id, idx) => {
              const row = byId.get(id);
              return row ? { ...row, position: idx } : undefined;
            })
            .filter((b): b is ContentBlock => !!b),
        };
        qc.setQueryData<AdminContentBlocksResponse>(KEY, next);
      }
      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
