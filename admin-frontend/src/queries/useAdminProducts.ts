import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductWithCategory, CategoryListResponse } from '@repo/shared';
import { defaultFetchFn } from '@/lib/admin-fetchers';

export function useAdminProducts() {
  return useQuery<{ products: ProductWithCategory[] }>({
    queryKey: ['api', 'admin', 'products'],
  });
}

export function useAdminProduct(id: number | null) {
  return useQuery<ProductWithCategory>({
    queryKey: ['api', 'admin', 'products', id],
    enabled: id != null,
  });
}

export function useCategories() {
  return useQuery<CategoryListResponse>({
    queryKey: ['api', 'categories'],
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      defaultFetchFn('/api/admin/products', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api', 'admin', 'products'] });
    },
  });
}

export function useUpdateProduct(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      defaultFetchFn(`/api/admin/products/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api', 'admin', 'products'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => defaultFetchFn(`/api/admin/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api', 'admin', 'products'] });
    },
  });
}
