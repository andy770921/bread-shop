# Implementation Plan: Backend Startup Sync + Reset Endpoint

## Overview

Two backend changes:

1. **Startup sync** — a new `SiteContentSyncService` that runs on `OnModuleInit`, flattens the JSON defaults, and upserts any missing keys into `site_content`. Never overwrites existing values. This is the Option B-2 mechanism described in `plans/json-usage-decision.md`.
2. **Reset endpoint** — replace the current `DELETE /api/admin/site-content/:key` (which deletes the DB row) with `POST /api/admin/site-content/:key/reset` (which writes the row's values back to the JSON defaults without deleting).

Also: allow empty string to flow through `PUT /api/admin/site-content/:key` untouched.

## Files to Modify

### Backend

- `backend/src/site-content/site-content-sync.service.ts` — **new**.
- `backend/src/site-content/site-content.module.ts` — register the sync service.
- `backend/src/site-content/flatten.ts` — **new** small helper (shared between sync and reset so both agree on how the JSON is flattened).
- `backend/src/admin/content-admin.service.ts` — replace `remove` with `resetToDefault`.
- `backend/src/admin/content-admin.controller.ts` — replace `@Delete(':key')` with `@Post(':key/reset')`.
- `backend/src/admin/dto/upsert-site-content.dto.ts` — confirm validators allow `''`.

### Shared

- `shared/src/types/site-content.ts` — no shape change; double-check `SiteContentEntry.value_zh` already typed as `string | null` (yes).

## Step-by-Step Implementation

### Step 1: Add a flatten helper

**File:** `backend/src/site-content/flatten.ts` (new)

**Content:**

```ts
import { defaultContent, type NestedRecord } from '@repo/shared';

export interface FlatDefault {
  key: string;
  value_zh: string;
  value_en: string;
}

function flatten(obj: NestedRecord, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      result[fullKey] = v;
    } else {
      Object.assign(result, flatten(v, fullKey));
    }
  }
  return result;
}

export function getFlatDefaults(): FlatDefault[] {
  const zhMap = flatten(defaultContent.zh);
  const enMap = flatten(defaultContent.en);
  const keys = new Set([...Object.keys(zhMap), ...Object.keys(enMap)]);
  return [...keys].map((key) => ({
    key,
    value_zh: zhMap[key] ?? '',
    value_en: enMap[key] ?? '',
  }));
}

export function getDefaultForKey(key: string): FlatDefault | null {
  return getFlatDefaults().find((d) => d.key === key) ?? null;
}
```

**Rationale:** both the sync service (needs all keys) and the reset endpoint (needs the single-key default) use the same flattening rule. Putting it in one file removes the chance of them disagreeing later.

### Step 2: Create the sync service

**File:** `backend/src/site-content/site-content-sync.service.ts` (new)

**Content:**

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { getFlatDefaults } from './flatten';

@Injectable()
export class SiteContentSyncService implements OnModuleInit {
  private readonly logger = new Logger(SiteContentSyncService.name);

  constructor(private supabase: SupabaseService) {}

  async onModuleInit() {
    await this.syncMissingKeys();
  }

  async syncMissingKeys(): Promise<{ inserted: number; skipped: number }> {
    try {
      const defaults = getFlatDefaults();
      const client = this.supabase.getClient();

      const { data: existing, error: selectError } = await client
        .from('site_content')
        .select('key');
      if (selectError) {
        this.logger.error(`Site content sync failed to list keys: ${selectError.message}`);
        return { inserted: 0, skipped: 0 };
      }

      const existingKeys = new Set((existing ?? []).map((row) => row.key));
      const missing = defaults.filter((d) => !existingKeys.has(d.key));

      if (missing.length === 0) {
        this.logger.log(`Site content sync: all ${defaults.length} keys already present.`);
        return { inserted: 0, skipped: defaults.length };
      }

      const rows = missing.map((d) => ({
        key: d.key,
        value_zh: d.value_zh,
        value_en: d.value_en,
        updated_by: null,
      }));

      const { error: insertError } = await client
        .from('site_content')
        .insert(rows);
      if (insertError) {
        this.logger.error(`Site content sync failed to insert: ${insertError.message}`);
        return { inserted: 0, skipped: defaults.length };
      }

      this.logger.log(
        `Site content sync: inserted ${missing.length} missing keys (${defaults.length - missing.length} already present).`,
      );
      return { inserted: missing.length, skipped: defaults.length - missing.length };
    } catch (err) {
      this.logger.error(`Site content sync crashed: ${(err as Error).message}`);
      return { inserted: 0, skipped: 0 };
    }
  }
}
```

**Rationale:**

- `onModuleInit` runs once per Nest bootstrap. On Vercel serverless that means once per cold start per function instance.
- `.insert()` not `.upsert()` — we never want to overwrite an edited value, and we've already filtered to missing keys.
- All errors are caught and logged; the method returns normally so a sync failure does not prevent the backend from serving traffic. A stale DB just means operators won't see the newly added key until a later boot.
- Return shape `{ inserted, skipped }` is useful for the spec file, nothing else reads it.

### Step 3: Register the sync service

**File:** `backend/src/site-content/site-content.module.ts`

**Change:** add `SiteContentSyncService` to both `providers` and (optional) `exports`. Confirm `SupabaseService` is reachable — if the module currently imports only `SupabaseModule`, no change needed since `SupabaseModule` is `@Global()` per CLAUDE.md.

**Example final state:**

```ts
@Module({
  controllers: [SiteContentController],
  providers: [SiteContentService, SiteContentSyncService],
})
export class SiteContentModule {}
```

**Rationale:** Nest instantiates anything in `providers`, and calling `onModuleInit` happens automatically for any provider that implements the interface.

### Step 4: Replace delete with reset in the admin service

**File:** `backend/src/admin/content-admin.service.ts`

**Changes:**

- Delete the existing `remove(key: string)` method.
- Add:

```ts
async resetToDefault(key: string, userId: string) {
  const fallback = getDefaultForKey(key);
  if (!fallback) {
    throw new NotFoundException(`No default value registered for key '${key}'.`);
  }

  const { data, error } = await this.supabase
    .getClient()
    .from('site_content')
    .upsert(
      {
        key,
        value_zh: fallback.value_zh,
        value_en: fallback.value_en,
        updated_by: userId,
      },
      { onConflict: 'key' },
    )
    .select()
    .single();
  if (error) throw new BadRequestException(error.message);
  return data;
}
```

- Add imports at the top: `NotFoundException`, `getDefaultForKey` from `../site-content/flatten`.
- Inside `upsert(key, dto, userId)`: ensure empty strings pass through. The current code uses `if (dto.value_zh !== undefined) payload.value_zh = dto.value_zh;` — this already accepts `''`. No change needed, but add a code comment? **No** — the code already reads correctly.

**Rationale:**

- `upsert` (not `update`) because an operator might hit Reset on a key that was added to JSON but whose sync hasn't run yet in some weird race — this makes the endpoint self-healing.
- Calling `resetToDefault` is logged via the existing `updated_by` column; that's sufficient audit trail for v1.
- `NotFoundException` on unknown key: catches the "operator is pointing at a key that isn't in JSON anymore" (i.e. orphan) case. Forces them to either add the key to JSON or delete the orphan manually. Orphan cleanup UI is out of scope.

### Step 5: Wire the new endpoint

**File:** `backend/src/admin/content-admin.controller.ts`

**Changes:**

- Remove `Delete` from the imports; add `Post`.
- Delete:
  ```ts
  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.service.remove(key);
  }
  ```
- Add:
  ```ts
  @Post(':key/reset')
  resetToDefault(
    @Param('key') key: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.resetToDefault(key, user.id);
  }
  ```

**Rationale:**

- `POST …/reset` reads like the action being performed. `PATCH` would also be defensible; `POST` chosen because the side effect is not a simple field assignment — it's "apply a canonical template to this row".
- Removing DELETE closes the door on "operator accidentally deletes a key via devtools" — the only way to remove a row is now a direct SQL action.

### Step 6: Confirm the DTO tolerates empty string

**File:** `backend/src/admin/dto/upsert-site-content.dto.ts`

**Check:** validators are `@IsOptional()` + `@IsString()` (not `@IsNotEmpty()`). If any `@IsNotEmpty()` validator exists on `value_zh` or `value_en`, delete it — empty string must be allowed.

**Rationale:** from the PRD, empty string is a deliberate blank, not an error.

## Testing Steps

1. **Unit test for sync** (`backend/src/site-content/site-content-sync.service.spec.ts`, new):
   - Mock `SupabaseService.getClient()` to return a builder whose `.select('key')` resolves with `{ data: [{ key: 'nav.home' }], error: null }`.
   - Mock `.insert(rows)` to resolve `{ error: null }`.
   - Call `syncMissingKeys()`. Assert `insert` called with rows excluding `nav.home`.
   - Second test: `.select` returns every key. Assert `insert` is not called and the service returns `{ inserted: 0, skipped: N }`.
   - Third test: `.insert` returns an error. Assert it is logged and does not throw.

2. **Unit test for reset** (`backend/src/admin/content-admin.service.spec.ts`):
   - `resetToDefault('nav.home', 'user-123')` sends upsert payload `{ key: 'nav.home', value_zh: '首頁', value_en: 'Home', updated_by: 'user-123' }`.
   - `resetToDefault('not.in.json', …)` throws `NotFoundException`.

3. **E2E** (`backend/test/admin.e2e-spec.ts` or similar):
   - Clear `site_content` in a test DB. Boot the Nest app with `await app.init()`. Query the table — expect one row per JSON key.
   - `PUT /api/admin/site-content/nav.home` with `{ value_zh: '' }`. Reload — expect `value_zh === ''`.
   - `POST /api/admin/site-content/nav.home/reset`. Reload — expect `value_zh === '首頁'`.

4. **Manual smoke**:
   - Drop `site_content` in a dev Supabase project (`TRUNCATE TABLE site_content;`).
   - `cd backend && npm run start:dev`. Watch the log for `Site content sync: inserted N missing keys`.
   - Hit `http://localhost:3000/api/site-content` and confirm every JSON key is returned.

## Dependencies

- **Must complete before:** `admin-frontend-editor.md` (the admin UI relies on the reset endpoint and on a fully-populated DB).
- **Depends on:** `shared-i18n-migration.md` (this file imports `defaultContent` from `@repo/shared`).

## Notes

- Sync currently runs blocking in `onModuleInit`. For a large key set this could add milliseconds to cold start; with today's key count (tens) it's unmeasurable. If the key set grows to thousands, consider moving the sync into a background task fired after `app.listen()` returns — but that's a future optimization.
- The sync runs on **every** cold start. On Vercel serverless that is fine because all it does on a synced DB is one `SELECT key` — cheap. No need for a "have I synced this boot?" guard.
- Orphan keys (rows in DB whose key is no longer in JSON): not touched by sync. Admin UI will still list them. `resetToDefault` on an orphan returns 404. Cleanup is out of scope.
- The replaced `DELETE` endpoint was the only consumer of `useDeleteSiteContent` in the admin frontend; that hook becomes dead code and is deleted in the admin-frontend-editor plan.
