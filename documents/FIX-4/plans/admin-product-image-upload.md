# FIX-4: Admin Product Image Upload — Root Cause Analysis

## Problem Statement

When a shop staff user on iPhone (via the LINE in-app browser) edits or
creates a product in the admin backoffice and picks a photo from the Photos
library, the thumbnail appears to preview correctly, but clicking "儲存"
surfaces only a generic red toast reading "發生錯誤" ("Something went wrong"),
and the product is never updated.

The symptoms looked like "preview works but save fails". In reality the
preview was **stale** — the image never reached Supabase Storage — and the
save itself was either never attempted with a new URL or was failing for a
reason the UI refused to show.

## Evidence Gathered

### 1. Bucket configuration rejects iPhone's default format

`storage.buckets` row for `product-images`:

```
public: true
file_size_limit: 5_242_880  (5 MB)
allowed_mime_types: [image/jpeg, image/png, image/webp]
```

The bucket enforces a MIME whitelist. Anything that reaches the signed PUT
endpoint with `Content-Type: image/heic` or `image/heif` is rejected with
HTTP 400 at the Storage layer, before a single byte is persisted.

### 2. iPhone's default camera format is HEIC

Since iOS 11 (Sept 2017), the iPhone Camera app writes photos as HEIF/HEIC
by default. The user's device reports `iPhone; CPU iPhone OS 18_7_1`, so
every photo they take is HEIC unless they have explicitly switched the
camera setting to "Most Compatible".

### 3. LINE in-app browser does not auto-transcode HEIC on upload

Native iOS Safari, when it services an `<input type="file" accept="image/*">`
pick from the Photos library, transcodes HEIC to JPEG on the way out. The
LINE WebView (`Safari Line/26.0.0` in the logs) does **not** do this —
the raw HEIC bytes are handed to `fetch()` as-is, with `file.type` often
set to `image/heic` or the empty string.

Combined with (1), this guarantees that a Photos-library pick from inside
the LINE browser will be rejected by Supabase.

### 4. Successful uploads in the logs were already JPEG

In the Supabase Storage access logs, every successful recent
`PUT /storage/v1/object/upload/sign/product-images/products/…` ended in
`.jpeg`. There is no trace of a HEIC upload succeeding. That is consistent
with those uploads having been chosen from sources that were already JPEG
(screenshots, downloaded images, or photos taken in "Most Compatible" mode).

### 5. The UI makes the failure indistinguishable from any other error

Three places catch upload or save errors and replace them with the generic
locale key `common.error`:

- `admin-frontend/src/components/products/ImageUploader.tsx` — upload path
- `admin-frontend/src/routes/dashboard/products/ProductEdit.tsx` — save path
- `admin-frontend/src/routes/dashboard/products/ProductNew.tsx` — save path

Because of this, the real HTTP status and message from Supabase / NestJS
never reach the user or the console in a useful form. A HEIC rejection
looks identical to an auth expiry, a DTO validation failure, a 5xx, or
CORS — all of them become the string "發生錯誤".

### 6. The "preview" was a lie

`ImageUploader` only calls `onChange(url)` after the upload pipeline
resolves. On failure it logs the error and shows the toast, but does not
clear the form's existing `image_url`. On the edit page, that existing
value is pre-populated from `initial.image_url` in `useEffect`, so the
`<img src={value}>` element keeps rendering the **old** image. The user
correctly saw "an image" and wrongly concluded the upload succeeded.

## Root Cause

The admin product-image upload pipeline assumes that whatever a browser
hands it under `accept="image/*"` is already in one of the three MIME
types the Supabase bucket allows. That assumption breaks on iPhone +
LINE in-app browser, because the input delivers HEIC unchanged. The
generic error toast then hides the failure, so the bug appeared as
"preview works but save doesn't".

## Fix Strategy

Three layers, all client-side in `admin-frontend`:

1. **Transcode HEIC/HEIF to JPEG before upload.** Use `heic-to`
   (`libheif` compiled to WASM, bundled as an inline Blob worker so no
   Vite/CSP changes are required). Detect via `isHeic()`, which inspects
   the ISO-BMFF brand bytes instead of trusting `file.type`, so files
   with an empty or wrong MIME type are still caught. Output JPEG at
   quality 0.85 to stay well under the 5 MB bucket limit.

2. **Validate locally before going to the network.** After the possible
   HEIC step, reject anything outside the bucket's MIME whitelist or
   over 5 MB with a specific, actionable message, instead of letting
   Supabase return a 400 that the user has to decode.

3. **Surface the real error everywhere.** Introduce one helper that
   peels the most informative string out of an error value —
   `ApiResponseError.body.message` (NestJS validation can send an
   array), Supabase Storage JSON error bodies, plain `Error.message`,
   and a fallback — and wire it into the upload, product-create, and
   product-edit catch blocks. Keep the user-facing prefix localized
   (`product.uploadFailed` / `product.saveFailed`) but append the raw
   message plus HTTP status so future failures can be diagnosed from a
   screenshot alone.

## Non-Goals

- Relaxing the bucket's MIME whitelist server-side. The bucket rule is a
  legitimate defense against unexpected uploads; converting on the
  client is the correct layer.
- Changing the backend's `POST /api/admin/uploads/product-image` signing
  flow. It works correctly; the problem is strictly the byte format
  handed to the PUT and the error-message plumbing on the client.
- Pre-emptive preview rewrite. The stale-preview confusion is removed
  as a side effect of actually surfacing the upload failure — the user
  will now see "圖片上傳失敗: …" on the failing attempt instead of
  silently believing the old thumbnail.

## Verification Plan

- Pick an iPhone HEIC photo inside the LINE in-app browser on the
  production admin URL. Expect a visible conversion pause, then a fresh
  thumbnail backed by a new `products/…-<ts>.jpg` object in the
  `product-images` bucket, then a successful save.
- Pick a JPEG screenshot. Expect the existing fast path (no conversion).
- Pick an oversized (>5 MB) JPEG. Expect a specific size-limit toast,
  never a network round-trip.
- Pick a random non-image file renamed to `.jpg`. Expect the MIME
  whitelist check to reject it with a specific message.
- Force a backend 400 (e.g. by sending a bad `category_id`). Expect the
  save toast to include the NestJS validation message and HTTP 400, not
  "發生錯誤".
