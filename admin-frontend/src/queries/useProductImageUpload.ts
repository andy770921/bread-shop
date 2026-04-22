import { defaultFetchFn } from '@/lib/admin-fetchers';

interface SignedUrlResponse {
  uploadUrl: string;
  path: string;
  token: string;
  publicUrl: string;
}

export async function uploadProductImage(file: File, productId?: number): Promise<string> {
  const signed = await defaultFetchFn<
    SignedUrlResponse,
    {
      filename: string;
      contentType: string;
      productId?: number;
    }
  >('/api/admin/uploads/product-image', {
    method: 'POST',
    body: {
      filename: file.name,
      contentType: file.type,
      productId,
    },
  });

  const putRes = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
  }

  return signed.publicUrl;
}
