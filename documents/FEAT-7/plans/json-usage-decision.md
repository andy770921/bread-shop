# Architecture Decision: Role of i18n JSON Under Option B-2

## Chosen Approach

**Option B — Seed DB once, keep JSON**, combined with **Option B-2 — backend auto-syncs missing keys on startup (no overwrite)**.

The source of truth for _values_ shifts from the i18n JSON files to the `site_content` table. The JSON files stay in the repo, but their role is reduced: they are now a **key-schema manifest** and a **first-time seed**, not a live content store.

## Comparison with Alternatives

| Aspect                            | Option A (JSON + DB merge)              | Option B-2 (Chosen)                        |
| --------------------------------- | --------------------------------------- | ------------------------------------------ |
| Admin input pre-filled            | Yes (via merge at read time)            | Yes (reads directly from DB)               |
| DB state on fresh deploy          | Empty; only edited keys get rows        | Fully populated via startup sync           |
| Backend read logic                | Must merge JSON defaults + DB overrides | Reads DB only; no merge needed             |
| "What are the live values?" check | Requires inspecting JSON + DB together  | `SELECT * FROM site_content` answers fully |
| Risk of JSON/DB drift             | Low (JSON is authoritative fallback)    | Medium (sync must run on deploy)           |
| Cost of adding a new key          | Edit JSON only                          | Edit JSON + backend startup inserts it     |

Option B-2 was chosen because the operational team needs a single, complete view of live values in the DB. The mental model "what's in the DB is what's on the site" is worth the extra sync step.

## Where the JSON Files Are Still Used

The repo keeps `frontend/src/i18n/zh.json` and `frontend/src/i18n/en.json`. Under Option B-2, they are referenced in **three** distinct scenarios.

### 1. First-Time Seed of a New Environment

When bringing up a brand-new environment (local dev database, staging, production), the `site_content` table starts empty. The first time the NestJS backend boots, a startup routine reads both JSON files, flattens them into dot-notation keys, and upserts each key into `site_content` with `value_zh` and `value_en` taken from the JSON defaults.

This removes the need for a separate `npm run seed:content` script: any environment that runs the backend ends up with a fully seeded table.

### 2. Source of Truth for the Key Schema

Developers continue to edit the JSON files when they add new UI strings. Example: adding an `about.history` section to the customer frontend means adding those keys to `zh.json` / `en.json` first — those keys become available to `t('about.history.title')` via the normal compiled bundle.

The JSON therefore remains the **developer-facing contract** for what keys exist. The DB is the **operator-facing store** for what values those keys currently hold.

### 3. Automatic Sync of Missing Keys on Deploy (Option B-2 Mechanism)

On every backend startup, the same sync routine runs:

- Flatten both JSON files into `{ key, defaultZh, defaultEn }` triples.
- For each triple, check whether a row with that `key` already exists in `site_content`.
- If the key is **missing**, insert a new row using the JSON values as initial content.
- If the key **already exists**, do nothing — preserving any edits operators have made.

This makes deploying a new UI string safe and automatic:

1. Developer adds `about.history.title` to the JSON files and ships a frontend using `t('about.history.title')`.
2. On the next backend deploy, startup sync notices the key is missing and inserts it with the JSON default.
3. Operators can then immediately find and edit the new key in the admin content page.

The sync **never** overwrites an existing value. Renaming or deleting a key still requires a manual data migration — this is intentional, because a stale `site_content` row is less damaging than silently erasing an operator's edit.

## Deletion and Orphan Keys

Keys removed from the JSON are **not** auto-deleted from `site_content`. They become orphaned rows: harmless (no UI renders them), but visible in the admin list. Cleanup is a manual operational task, not part of the sync routine. This avoids accidental data loss during a bad deploy.

If the orphan list grows unwieldy later, a separate admin-only "prune orphans" action can be added — out of scope for FEAT-7.

## What This Means for Each Consumer

| Consumer              | Reads From                                                   | Writes To                          |
| --------------------- | ------------------------------------------------------------ | ---------------------------------- |
| Admin `ContentEditor` | `GET /api/admin/site-content` (DB, fully populated)          | `PUT /api/admin/site-content/:key` |
| Admin key list        | `GET /api/admin/site-content` — DB itself drives the list    | —                                  |
| Customer frontend     | `GET /api/site-content` (DB)                                 | —                                  |
| Developer             | JSON (for adding new keys, and for compile-time `t()` types) | JSON files in PR                   |
| Backend startup       | JSON (for sync)                                              | `site_content` (upsert missing)    |

Note: after Option B-2 is in place, the admin frontend's current `getContentGroups()` helper — which today flattens JSON for the key list — is no longer the source of truth. It can either be removed in favor of reading key groups from the DB response, or kept as a grouping hint (section names derived from the `.`-prefix). The PRD covers this in the admin-frontend implementation plan.

## Failure Modes to Be Aware Of

- **Sync fails at startup**: backend should log the error but continue booting. A missing sync run means operators don't see a newly added key until the next successful boot — annoying but not an outage.
- **DB completely empty at cold start**: the first boot's sync populates everything. The first request within that boot window may race; the sync should complete before the HTTP listener opens (run in `onModuleInit` or equivalent).
- **JSON and DB disagree on an existing key**: DB wins. This is the whole point of the architecture — operators can edit values without the next deploy stomping their change.
