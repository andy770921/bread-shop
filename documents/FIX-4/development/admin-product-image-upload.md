# FIX-4: Admin Product Save — Code Changes

The ticket shipped in two rounds. Round 1 fixed iPhone HEIC uploads and
made error messages specific. Round 2, enabled by round 1's clearer
errors, fixed a `category_id = 0` submit path that was previously
masked by the generic "發生錯誤" toast.

All round-1 changes are confined to `admin-frontend/`. Round 2 also
tightens the two admin DTOs in `backend/`.

## Summary of Touched Files

Round 1 (HEIC + error surfacing):

- `admin-frontend/package.json` — add `heic-to` dependency
- `admin-frontend/src/queries/useProductImageUpload.ts` — HEIC transcode,
  pre-upload validation, real error surfacing on both the signed-URL POST
  and the Storage PUT
- `admin-frontend/src/lib/extract-error-message.ts` — new helper that
  unwraps `ApiResponseError` and plain errors into a readable string
- `admin-frontend/src/components/products/ImageUploader.tsx` — show the
  real error in the toast; widen `accept` to include `.heic` / `.heif`
- `admin-frontend/src/routes/dashboard/products/ProductNew.tsx` — show the
  real error in the save toast
- `admin-frontend/src/routes/dashboard/products/ProductEdit.tsx` — show
  the real error in the save toast
- `admin-frontend/src/i18n/zh.json`, `en.json` — new keys
  `product.uploadFailed` and `product.saveFailed`

Round 2 (category_id FK violation, client-side only):

- `admin-frontend/src/components/products/ProductForm.tsx` — require
  `category_id >= 1` in Zod and show a localized error on the Field
- `admin-frontend/src/i18n/zh.json`, `en.json` — new key
  `product.categoryRequired`

No backend DTO changes. The backend stays untouched; the form is the
only entry point for this data, so the validation belongs there.

## 1. Add `heic-to`

### Before (`admin-frontend/package.json`, deps slice)

```json
"clsx": "^2.1.1",
"lucide-react": "^0.453.0",
```

### After

```json
"clsx": "^2.1.1",
"heic-to": "^1.4.2",
"lucide-react": "^0.453.0",
```

`heic-to` ships `libheif` as WASM inside an inline Blob-URL worker, so no
changes are needed in `vite.config.ts` or any CSP declaration.

## 2. Rewrite the upload pipeline

File: `admin-frontend/src/queries/useProductImageUpload.ts`

### Before (full file)

```ts
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
```

Problems:

- No HEIC handling; an iPhone Photos pick in LINE WebView hits Supabase
  with `Content-Type: image/heic` and gets 400 from the bucket's MIME
  whitelist.
- The signed-URL POST throw path is untouched: if the NestJS endpoint
  rejects the request (DTO validation, auth, etc.), whatever
  `defaultFetchFn` throws propagates as-is, and callers only see the
  default toast string.
- The PUT failure branch throws `"Upload failed: 400 Bad Request"` with
  no body — Supabase Storage returns a JSON `{ message, error }` that
  explains _why_ (e.g. `mime type image/heic is not supported`), and
  that message is discarded.

### After (full file)

```ts
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
```

Behavior notes:

- `isHeic()` detects HEIC by inspecting the ISO-BMFF brand bytes
  (`mif1`, `msf1`, `heic`, `heix`, `hevc`, `hevx`), so files with an
  empty or incorrect `file.type` are still caught.
- `heicTo({ type: 'image/jpeg', quality: 0.85 })` is a pragmatic default
  for product photos: it keeps conversions under the 5 MB bucket cap on
  12 MP iPhone input while staying visually indistinguishable from
  lossless.
- The signed-URL error path now speaks NestJS fluently. `class-validator`
  errors come back as `{ message: string[] }`, so the `Array.isArray`
  branch joins them into one human-readable line.
- The Storage error path reads the body as text first and only
  `JSON.parse` if it looks like JSON, so a malformed HTML error page
  (e.g. a Cloudflare interstitial) still surfaces _something_ instead
  of a swallowed exception.

## 3. New error-extraction helper

File: `admin-frontend/src/lib/extract-error-message.ts` (new)

```ts
import { ApiResponseError } from '@repo/shared';

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiResponseError) {
    const body = err.body as { message?: unknown; error?: unknown } | null | string;
    if (body && typeof body === 'object') {
      const raw = body.message ?? body.error;
      if (Array.isArray(raw)) return `${raw.map(String).join('; ')} (HTTP ${err.status})`;
      if (typeof raw === 'string' && raw.length > 0) return `${raw} (HTTP ${err.status})`;
    }
    if (typeof body === 'string' && body.length > 0) return `${body} (HTTP ${err.status})`;
    return `${err.statusText || fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}
```

This is the single place where the shape-shifting NestJS/Supabase error
bodies are decoded. Every admin catch block now goes through it.

## 4. `ImageUploader` toast and file-input accept

File: `admin-frontend/src/components/products/ImageUploader.tsx`

### Before (imports + handler)

```tsx
import { uploadProductImage } from '@/queries/useProductImageUpload';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// …

async function handleFile(file: File) {
  setUploading(true);
  try {
    const url = await uploadProductImage(file, productId);
    onChange(url);
  } catch (err) {
    console.error(err);
    toast.error(t('common.error'));
  } finally {
    setUploading(false);
  }
}
```

### After

```tsx
import { uploadProductImage } from '@/queries/useProductImageUpload';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/extract-error-message';
import { toast } from 'sonner';

// …

async function handleFile(file: File) {
  setUploading(true);
  try {
    const url = await uploadProductImage(file, productId);
    onChange(url);
  } catch (err) {
    console.error('Product image upload failed', err);
    toast.error(`${t('product.uploadFailed')}: ${extractErrorMessage(err, t('common.error'))}`);
  } finally {
    setUploading(false);
  }
}
```

### File-input `accept`

#### Before

```tsx
<input
  ref={inputRef}
  type="file"
  accept="image/*"
  hidden
  // …
/>
```

#### After

```tsx
<input
  ref={inputRef}
  type="file"
  accept="image/*,.heic,.heif"
  hidden
  // …
/>
```

`image/*` covers HEIC on iOS, but some Android/desktop file dialogs
filter it out because their system MIME database does not include the
HEIC types. Explicitly listing the extensions keeps HEIC selectable
everywhere.

## 5. `ProductNew` save toast

File: `admin-frontend/src/routes/dashboard/products/ProductNew.tsx`

### Before

```tsx
import { useCreateProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';

// …

try {
  await create.mutateAsync({
    ...values,
    badge_type: values.badge_type || null,
    image_url: values.image_url || null,
  });
  toast.success(t('product.save'));
  navigate('/dashboard/products');
} catch (err) {
  console.error(err);
  toast.error(t('common.error'));
}
```

### After

```tsx
import { useCreateProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';
import { extractErrorMessage } from '@/lib/extract-error-message';

// …

try {
  await create.mutateAsync({
    ...values,
    badge_type: values.badge_type || null,
    image_url: values.image_url || null,
  });
  toast.success(t('product.save'));
  navigate('/dashboard/products');
} catch (err) {
  console.error('Product create failed', err);
  toast.error(`${t('product.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`);
}
```

## 6. `ProductEdit` save toast

File: `admin-frontend/src/routes/dashboard/products/ProductEdit.tsx`

### Before

```tsx
import { useAdminProduct, useUpdateProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';

// …

try {
  await update.mutateAsync({
    ...values,
    badge_type: values.badge_type || null,
    image_url: values.image_url || null,
  });
  toast.success(t('product.save'));
  navigate('/dashboard/products');
} catch (err) {
  console.error(err);
  toast.error(t('common.error'));
}
```

### After

```tsx
import { useAdminProduct, useUpdateProduct } from '@/queries/useAdminProducts';
import { useLocale } from '@/hooks/use-locale';
import { extractErrorMessage } from '@/lib/extract-error-message';

// …

try {
  await update.mutateAsync({
    ...values,
    badge_type: values.badge_type || null,
    image_url: values.image_url || null,
  });
  toast.success(t('product.save'));
  navigate('/dashboard/products');
} catch (err) {
  console.error('Product update failed', err);
  toast.error(`${t('product.saveFailed')}: ${extractErrorMessage(err, t('common.error'))}`);
}
```

## 7. i18n keys

File: `admin-frontend/src/i18n/zh.json`

### Before

```json
"uploadImage": "上傳圖片",
"uploading": "上傳中…",
"dropImage": "拖曳或點擊上傳圖片",
```

### After

```json
"uploadImage": "上傳圖片",
"uploading": "上傳中…",
"dropImage": "拖曳或點擊上傳圖片",
"uploadFailed": "圖片上傳失敗",
"saveFailed": "儲存失敗",
```

File: `admin-frontend/src/i18n/en.json`

### Before

```json
"uploadImage": "Upload Image",
"uploading": "Uploading…",
"dropImage": "Drag an image here or click to upload",
```

### After

```json
"uploadImage": "Upload Image",
"uploading": "Uploading…",
"dropImage": "Drag an image here or click to upload",
"uploadFailed": "Image upload failed",
"saveFailed": "Save failed",
```

## Round 2 — Block `category_id = 0` before it hits Postgres

After round 1 shipped, a real save still failed with:

```
儲存失敗: insert or update on table "products" violates foreign key
constraint "products_category_id_fkey" (HTTP 400)
```

The form default is `category_id: 0`; the Zod schema and DTO both
accepted `0`; the Select widget renders a placeholder for `0` (because
the JSX does `value={field.value ? String(field.value) : undefined}`).
Result: a user who never opened the category dropdown could submit a
request that only Postgres's foreign key rejected.

### R2.1 `ProductForm` Zod schema and Field message

File: `admin-frontend/src/components/products/ProductForm.tsx`

#### Before (schema)

```ts
const schema = z.object({
  name_zh: z.string().min(1),
  name_en: z.string().min(1),
  description_zh: z.string().optional(),
  description_en: z.string().optional(),
  price: z.coerce.number().int().min(0),
  category_id: z.coerce.number().int(),
  image_url: z.string().url().optional().or(z.literal('')),
  badge_type: z.enum(['hot', 'new', 'seasonal', '']).optional(),
  sort_order: z.coerce.number().int(),
  is_active: z.boolean(),
});
```

#### After (schema)

```ts
const schema = z.object({
  name_zh: z.string().min(1),
  name_en: z.string().min(1),
  description_zh: z.string().optional(),
  description_en: z.string().optional(),
  price: z.coerce.number().int().min(0),
  // category_id must reference an existing row in categories; 0 (the form
  // default before the Select is touched) would hit products_category_id_fkey
  // at the database, so reject it here instead.
  category_id: z.coerce.number().int().min(1),
  image_url: z.string().url().optional().or(z.literal('')),
  badge_type: z.enum(['hot', 'new', 'seasonal', '']).optional(),
  sort_order: z.coerce.number().int(),
  is_active: z.boolean(),
});
```

#### Before (Field)

```tsx
<Field label={t('product.category')} error={errors.category_id?.message}>
  <Controller
    name="category_id"
    control={control}
```

#### After (Field)

```tsx
<Field
  label={t('product.category')}
  error={errors.category_id ? t('product.categoryRequired') : undefined}
>
  <Controller
    name="category_id"
    control={control}
```

The default Zod message ("Number must be greater than or equal to 1")
would be shown raw to the user otherwise. The Field override keeps the
message locale-appropriate without bolting a Zod `errorMap` onto the
whole form.

### R2.2 i18n key

File: `admin-frontend/src/i18n/zh.json`

#### Before

```json
"uploadFailed": "圖片上傳失敗",
"saveFailed": "儲存失敗",
```

#### After

```json
"uploadFailed": "圖片上傳失敗",
"saveFailed": "儲存失敗",
"categoryRequired": "請選擇分類",
```

File: `admin-frontend/src/i18n/en.json`

#### Before

```json
"uploadFailed": "Image upload failed",
"saveFailed": "Save failed",
```

#### After

```json
"uploadFailed": "Image upload failed",
"saveFailed": "Save failed",
"categoryRequired": "Please select a category",
```

### Why this is the right layering

- Client-side (`min(1)` + localized error) gives the user a fast, in-form
  explanation and prevents a pointless network round-trip on every
  accidental save. `react-hook-form`'s `handleSubmit` refuses to call
  the mutation until the schema passes, so the product POST/PATCH
  literally never fires with `category_id = 0`.
- The backend is deliberately left unchanged. The form is the only
  entry point and the Postgres foreign key is the ultimate guard — if
  a genuine race fires ("category deleted between load and save"), the
  raw FK message surfaces through `extractErrorMessage` at the level of
  detail an admin can act on.

## Build / Lint

Verified on this change set:

```
npm run build -w admin-frontend   # tsc -b && vite build — clean
npm run lint                      # eslint all workspaces — clean
```

Bundle size grew from ~900 KB to ~3.56 MB (gzip 904 KB) because `heic-to`
inlines libheif's WASM for offline conversion. This is acceptable for a
staff-only backoffice; a later optimization could dynamic-`import()` the
HEIC path so the WASM only downloads when an actual HEIC file is picked.

## How This Maps to the Original Symptoms

- "Preview works" — The stale preview was the previously-saved
  `initial.image_url`, which the edit page pre-fills in `useEffect`. The
  new version still shows that value until a new upload succeeds, but
  the failing upload now fires a specific error toast instead of the
  generic `common.error`, so the user can no longer mistake the old
  thumbnail for a successful new upload.
- "Cannot save (round 1)" — The upload itself was rejected by Supabase
  Storage for HEIC bytes that the bucket did not allow. The transcode
  step eliminates that class of failure and the error-message plumbing
  would have exposed it instantly if round 1 had missed something.
- "Cannot save (round 2)" — The upload actually succeeded, but the
  product write sent `category_id: 0` because the user never opened
  the Select and every gate between the form and Postgres accepted
  `0`. Round 2 closes the gate where it belongs — in the form itself
  via Zod `min(1)` and a localized field error — so `handleSubmit`
  refuses to fire the network call. The Postgres FK stays as the
  last-resort guard for true races.
