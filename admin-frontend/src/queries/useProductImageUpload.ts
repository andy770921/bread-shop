import { heicTo, isHeic } from 'heic-to';
import { defaultFetchFn } from '@/lib/admin-fetchers';
import { ApiResponseError } from '@repo/shared';

interface SignedUrlResponse {
  uploadUrl: string;
  path: string;
  token: string;
  publicUrl: string;
}

const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// iPhone's default photo format is HEIC/HEIF, which the `product-images` bucket
// rejects (allowed_mime_types = [jpeg, png, webp]). Convert on the client via
// libheif (shipped as WASM inside heic-to) so the bucket never sees HEIC.
async function normalizeIphoneHeic(file: File): Promise<File> {
  if (!(await isHeic(file))) return file;

  const jpegBlob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.85 });
  const baseName = file.name.replace(/\.(heic|heif)$/i, '') || 'image';
  return new File([jpegBlob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

function assertUploadable(file: File): void {
  if (!SUPPORTED_MIME_TYPES.includes(file.type as (typeof SUPPORTED_MIME_TYPES)[number])) {
    throw new Error(
      `Unsupported image format: ${file.type || 'unknown'}. Only JPEG, PNG, and WebP are allowed.`,
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`Image too large (${mb} MB). Max is 5 MB.`);
  }
}

async function parseStorageErrorBody(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return res.statusText || `HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return parsed.message || parsed.error || text;
  } catch {
    return text;
  }
}

export async function uploadProductImage(input: File, productId?: number): Promise<string> {
  const file = await normalizeIphoneHeic(input);
  assertUploadable(file);

  let signed: SignedUrlResponse;
  try {
    signed = await defaultFetchFn<
      SignedUrlResponse,
      { filename: string; contentType: string; productId?: number }
    >('/api/admin/uploads/product-image', {
      method: 'POST',
      body: { filename: file.name, contentType: file.type, productId },
    });
  } catch (err) {
    if (err instanceof ApiResponseError) {
      const body = err.body as { message?: unknown } | null;
      const msg = Array.isArray(body?.message)
        ? body.message.map(String).join('; ')
        : typeof body?.message === 'string' && body.message.length > 0
          ? body.message
          : err.statusText || 'unknown error';
      throw new Error(`Failed to sign upload URL (HTTP ${err.status}): ${msg}`);
    }
    throw err;
  }

  const putRes = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!putRes.ok) {
    const detail = await parseStorageErrorBody(putRes);
    throw new Error(`Storage upload failed (HTTP ${putRes.status}): ${detail}`);
  }

  return signed.publicUrl;
}
