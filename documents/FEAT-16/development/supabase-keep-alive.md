# Supabase Keep-Alive — Implementation

## Document Information

- **Ticket:** FEAT-16
- **Created:** 2026-11-03
- **Revised:** 2026-11-03 — GitHub Actions workflow replaced by Vercel Cron
- **Author:** Claude Code
- **Plan:** [../plans/supabase-keep-alive.md](../plans/supabase-keep-alive.md)

## Changes

| File                                        | Change                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `backend/src/app.service.ts`                | Injects `SupabaseService`; adds `getDatabaseHealth()`                        |
| `backend/src/app.controller.ts`             | Adds `GET /api/health/db` with `Cache-Control: no-store`                     |
| `backend/src/app.controller.spec.ts`        | Provides a mocked `SupabaseService`; covers ok and query-error paths         |
| `backend/vercel.json`                       | Adds three `crons` entries; the rest of the file is unchanged                |
| `.github/workflows/supabase-keep-alive.yml` | **Removed.** It was the first scheduler; see the plan for why it was dropped |

`.github/workflows/ci.yml` is unaffected. No new environment variables, no secrets, no
database changes.

## Endpoint Behaviour

```
GET /api/health/db
```

| Situation                                    | Status | Body                                                              |
| -------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Query succeeds                               | `200`  | `{ "status": "ok", "timestamp": "<ISO 8601>" }`                   |
| Query returns an error (e.g. project paused) | `503`  | `Database is unreachable`. Driver message is logged, not returned |

The query is `supabase.from('categories').select('id').limit(1)` on the service_role data
client. That is a real PostgREST request against a user table, which is the kind of
activity Supabase counts.

There is no "Supabase not configured" branch. `SupabaseService` uses `getOrThrow` for
`SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, so the app does not boot without them.

## Cron Schedule

| Schedule     | Fires between (UTC) | Fires between (Taiwan, UTC+8) |
| ------------ | ------------------- | ----------------------------- |
| `0 1 * * *`  | 01:00–01:59         | 09:00–09:59                   |
| `0 9 * * *`  | 09:00–09:59         | 17:00–17:59                   |
| `0 17 * * *` | 17:00–17:59         | 01:00–01:59 (next day)        |

On the Hobby plan, Vercel picks the minute within the hour. Each job runs only against the
production deployment. `backend/vercel.json` validates against Vercel's published schema
(`https://openapi.vercel.sh/vercel.json`).

## Setup After Merge

1. **Push to `main`** so Vercel deploys the backend to production.
2. **Smoke-test production:**

   ```bash
   curl -i https://papa-bread-api.vercel.app/api/health      # 200
   curl -i https://papa-bread-api.vercel.app/api/health/db   # 200, Cache-Control: no-store, no Set-Cookie
   ```

3. **Confirm the jobs:** Backend project → Settings → **Cron Jobs** should list three entries
   for `/api/health/db`. A run can be triggered by hand from the deployment summary, or with
   the `vercel crons` CLI.

## Verification

```bash
# Unit tests (endpoint)
cd backend && npx jest src/app.controller.spec.ts

# Local endpoint (with backend/.env pointing at Supabase)
npm run dev
curl -i http://localhost:3000/api/health/db
```

Vercel Cron does not run locally (`vercel dev` and framework dev servers are not
supported). Calling the endpoint directly is the local equivalent.

## Operations

- **Changing the schedule:** edit `crons` in `backend/vercel.json` and redeploy. Hobby rejects
  any expression that would run more than once a day.
- **Seeing results:** Settings → Cron Jobs → View Logs. Hobby keeps runtime logs for one hour
  only, so check soon after a run.
- **Failure alerts:** Vercel does not email on cron failures. The backstop is Supabase's
  warning email, sent about a week before a pause. If the project is already paused,
  restore it from the Supabase dashboard; cron calls do not unpause it.
- **Pausing the keep-alive:** Settings → Cron Jobs → Disable Cron Jobs. It stays disabled until
  it is re-enabled there.
