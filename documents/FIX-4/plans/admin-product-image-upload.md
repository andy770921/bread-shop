# FIX-4: Admin Product Save — Root Cause Analysis

> This ticket started as an image-upload bug. Fixing the first root cause
> surfaced a **second, previously-masked root cause** in the same save
> flow. Both are documented below, in the order they were discovered.

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

After the first fix landed, the save still failed for some users, but the
new, specific error toast revealed what had been hidden all along:

> 儲存失敗: insert or update on table "products" violates foreign key
> constraint "products_category_id_fkey" (HTTP 400)

That is a second, independent bug with the same "looks generic" symptom —
previously indistinguishable from the HEIC failure — now caught by the
improved error surfacing.

## First Root Cause — HEIC uploads rejected by the Storage bucket

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

## Root Cause (image upload)

The admin product-image upload pipeline assumes that whatever a browser
hands it under `accept="image/*"` is already in one of the three MIME
types the Supabase bucket allows. That assumption breaks on iPhone +
LINE in-app browser, because the input delivers HEIC unchanged. The
generic error toast then hides the failure, so the bug appeared as
"preview works but save doesn't".

## Fix Strategy (image upload)

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

## Second Root Cause — `category_id = 0` leaks to Postgres

### What the real error said

With the first fix in place the save toast changed from
"發生錯誤" to:

```
儲存失敗: insert or update on table "products" violates foreign key
constraint "products_category_id_fkey" (HTTP 400)
```

That is Postgres rejecting a `products` write because the submitted
`category_id` does not match any row in `categories`.

### Database state (from direct SQL inspection)

```
categories: [1=toast, 2=cake, 3=cookie, 4=bread, 5=other]
products:   every existing row has category_id ∈ {2,3,4,5}
```

So the foreign key is intact. The only way to trigger the violation is
to submit a `category_id` that is not one of `1..5`. The form default
is `0`, and `0` is what gets submitted if the user never touches the
Select.

### Why `category_id = 0` slipped all the way through

Four guards that _look_ like they validate the category are actually no-ops:

1. **Form default** (`admin-frontend/src/components/products/ProductForm.tsx`):

   ```ts
   defaultValues: {
     ...
     category_id: 0,
     ...
   }
   ```

   `0` is what the form carries until the user opens the dropdown and picks
   something.

2. **Zod schema**:

   ```ts
   category_id: z.coerce.number().int(),
   ```

   No `.min(1)` and no `.positive()`. `0` is a valid integer, so the
   schema happily hands it back to react-hook-form.

3. **Select widget UI state**:

   ```tsx
   <Select
     value={field.value ? String(field.value) : undefined}
     onValueChange={(v) => field.onChange(Number(v))}
   >
   ```

   `field.value === 0` is falsy, so the widget renders the placeholder
   (`-`). The user sees "no category selected", but the form state is
   still `0`. There is no visual signal that the value is invalid — the
   UI is showing the same "unselected" glyph that a brand-new form
   shows.

4. **Backend DTO** (`backend/src/admin/dto/create-product.dto.ts`,
   `update-product.dto.ts`):

   ```ts
   @IsInt() category_id!: number;            // create
   @IsOptional() @IsInt() category_id?: number;  // update
   ```

   `@IsInt()` accepts `0`. There is no `@Min(1)` and no "category must
   exist" check.

So the payload reaches Supabase with `category_id: 0`, and only the
Postgres foreign key stops it. Before the error-surfacing fix, this
looked identical to the HEIC upload failure: one generic toast, zero
signal.

### Why this was plausibly _always_ broken, not newly introduced

Every `category_id` actually persisted in the database today is in
`{2,3,4,5}` — users who succeeded in saving products must have picked
a category. The code path for "forgot to pick" has always produced a
400; it was simply invisible behind `t('common.error')`.

## Fix Strategy (category validation)

Client-side only, per explicit product decision:

- Tighten the Zod schema to
  `category_id: z.coerce.number().int().min(1)` and wire a localized
  error message on the category Field, so the user sees "請選擇分類" /
  "Please select a category" before the form attempts a network call.
  `react-hook-form`'s `handleSubmit` already blocks invalid state, so
  the PATCH/POST will not fire at all.

Rejected alternative — add `@Min(1)` to the backend DTOs as a second
layer. The initial draft of this fix did that, but it was pulled back:
the form is the only legitimate entry point for this data, and the
stricter-is-safer instinct on the server was unjustified scope. The
Postgres foreign key stays as the ultimate guard for the genuine race
case, and thanks to the round-1 error-surfacing work, the raw FK
message is now actually readable when that race fires.

No change to the backend, no change to the database, and no change to
the Select widget beyond the error message plumbing.

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
- Checking _existence_ of the category inside the backend service (e.g.
  `SELECT 1 FROM categories WHERE id = $1`). The FK constraint already
  enforces existence; once the `@Min(1)` guard is in place, the only
  remaining way to trigger a FK error is a genuine race with a category
  being deleted, at which point the raw message is appropriate.
- Disabling the save button until the form is valid. `handleSubmit`
  already guards this, and disabling the button tends to hide _which_
  field is at fault.

## Verification Plan

### Image-upload path

- Pick an iPhone HEIC photo inside the LINE in-app browser on the
  production admin URL. Expect a visible conversion pause, then a fresh
  thumbnail backed by a new `products/…-<ts>.jpg` object in the
  `product-images` bucket, then a successful save.
- Pick a JPEG screenshot. Expect the existing fast path (no conversion).
- Pick an oversized (>5 MB) JPEG. Expect a specific size-limit toast,
  never a network round-trip.
- Pick a random non-image file renamed to `.jpg`. Expect the MIME
  whitelist check to reject it with a specific message.

### Category-id path

- Open "New Product", fill every field except category, press save.
  Expect a red under-field message "請選擇分類" and **no** network call
  (the product POST should not appear in devtools → Network).
- Repeat with a selected category; expect a normal success flow.
- Edit an existing product, do not touch the category, press save.
  Expect success (the pre-filled `category_id` is a valid integer
  ≥ 1, so the new `min(1)` does not regress the happy path).

### Generic error-surface regression check

- Force any backend 400 by sending malformed data. Expect the save
  toast to include the NestJS / Supabase message and HTTP status
  instead of "發生錯誤". This is the guard rail that surfaced the
  second root cause and must continue to hold.
