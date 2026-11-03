# Supabase Keep-Alive — Implementation

## Document Information

- **Ticket:** FEAT-16
- **Created:** 2026-11-03
- **Author:** Claude Code
- **Plan:** [../plans/supabase-keep-alive.md](../plans/supabase-keep-alive.md)

## Changes

| File                                        | Change                                                               |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `backend/src/app.service.ts`                | Injects `SupabaseService`; adds `getDatabaseHealth()`                |
| `backend/src/app.controller.ts`             | Adds `GET /api/health/db` with `Cache-Control: no-store`             |
| `backend/src/app.controller.spec.ts`        | Provides a mocked `SupabaseService`; covers ok and query-error paths |
| `.github/workflows/supabase-keep-alive.yml` | Twice-daily scheduled `curl` to `/api/health/db`                     |

No new environment variables, no GitHub secrets, no database changes.

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

## Setup After Merge

1. **Deploy the backend** so `/api/health/db` exists in production. Until then the workflow
   gets a 404 and fails.
2. **Push to `main` on GitHub.** Scheduled workflows only run from the default branch.
3. **Run it once by hand:** GitHub → Actions → _Supabase keep-alive_ → _Run workflow_. Check
   that the log ends with `{"status":"ok",...}`.

The live log page can keep counting after the step has finished. If the log already shows
`{"status":"ok",...}`, reload the page; the job usually completes in about 5 seconds.

## Verification

```bash
# Unit tests
cd backend && npx jest src/app.controller.spec.ts

# Local endpoint (with backend/.env pointing at Supabase)
npm run dev
curl -i http://localhost:3000/api/health/db

# Production, after deploy
curl -i https://papa-bread-api.vercel.app/api/health/db
```

## Operations

- **Changing the backend URL:** edit `env.BACKEND_URL` in the workflow file.
- **Failure emails** go to whoever last edited the `cron:` line. A red run means either the
  backend or the database is down. If the project is already paused, restore it from the
  Supabase dashboard; the workflow does not unpause projects.
- **60-day auto-disable:** this repo is public. If nothing is pushed for 60 days, GitHub
  disables the schedule. Re-enable it from the Actions tab (or
  `gh workflow enable supabase-keep-alive.yml`). Do not add a bot that commits or re-enables
  just to reset the clock; the best-known Action that did this was disabled by GitHub for a
  ToS violation.
