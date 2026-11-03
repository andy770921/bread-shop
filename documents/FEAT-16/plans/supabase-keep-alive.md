# Supabase Keep-Alive — Plan

## Document Information

- **Ticket:** FEAT-16
- **Created:** 2026-11-03
- **Author:** Claude Code
- **Status:** Implemented

## Problem Statement

The database runs on the Supabase **Free plan**. When the shop gets no traffic for a while,
Supabase pauses the project. Then the storefront, the admin backoffice and LINE checkout
all fail until someone restores the project by hand from the Supabase dashboard.

## Research

### When does Supabase pause a project?

From the official docs ([Project Pausing][supabase-pausing]):

- Pausing is a **rolling 7-day check**. A Free-plan project is paused when it "does not
  receive sufficient user database activity over the past week".
- "A few user requests to the database each day" over the previous week is typically
  enough to stay active. API calls to the project and requests from a connected app both
  count.
- The owner gets a **warning email roughly one week before** the pause, then a
  confirmation once it is paused.
- A paused project can be restored for **up to 1 year** after it was paused. Older copies
  of the page say 90 days; the current page says 1 year.
- Paid-plan projects are never paused for inactivity.

The docs say nothing about whether scheduled pings are allowed. They also do not list jobs
running inside the database as activity. The plan therefore relies on real API requests
from outside the database.

### Common approaches

| Approach                       | How it works                                                                                                                                                             | Notes                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| GitHub Actions → Supabase REST | A scheduled workflow `curl`s `https://<ref>.supabase.co/rest/v1/<table>` with a project key from repo secrets ([dev.to][devto-gha], [Supabase Keepalive][oss-keepalive]) | The most common recipe. Needs a Supabase key stored in GitHub               |
| App endpoint + scheduler       | The app exposes an endpoint that **must make a database call** and must not be cached; a scheduler calls it ([supabase-pause-prevention][travisvn])                      | Keeps DB credentials inside the app                                         |
| Vercel Cron                    | `crons` entry in `vercel.json`                                                                                                                                           | Hobby plan: once per day at most, ±59 min precision ([Vercel][vercel-cron]) |
| External uptime monitor        | UptimeRobot, cron-job.org, etc. hitting an endpoint                                                                                                                      | Another account to manage                                                   |

Typical schedules in the guides range from every 3 days to twice a week. Given the
"a few requests each day" wording in the official docs, daily or more often is the safer
reading.

### GitHub Actions caveats

From GitHub's [schedule event docs][gha-schedule]:

1. **Runs can be late or dropped.** "High load times include the start of every hour", and
   "if the load is sufficiently high enough, some queued jobs may be dropped."
2. **60-day auto-disable.** "In a public repository, scheduled workflows are automatically
   disabled when no repository activity has occurred in 60 days." This repo is public.
3. **Default branch only.** Scheduled workflows run only on the default branch (`main`).
4. **Failure emails** go to "the user who last modified the cron syntax in the workflow
   file."

The popular `gautamkrishnar/keepalive-workflow` Action, which worked around the 60-day
rule, has been disabled by GitHub Staff "due to a violation of GitHub's terms of service".
We do **not** work around the 60-day rule.

## Options Considered

### Option A — Workflow calls Supabase REST directly

- **Pros:** most common; does not depend on the backend deployment.
- **Cons:** the backend only holds the `service_role` key, which bypasses RLS. Putting it
  in GitHub secrets moves full database access, including customer PII in `orders` and
  `profiles`, into a second system. A 200 from PostgREST also says nothing about whether
  the shop backend itself works.

### Option B — Workflow calls a backend DB health endpoint (chosen)

Add `GET /api/health/db` to the backend. It runs a minimal read, and the workflow calls it.

- **Pros:** no database credentials leave Vercel. The request takes the same path as real
  traffic (Vercel → NestJS → supabase-js → PostgREST → Postgres), so a failed run means the
  shop is actually down. The endpoint is also a useful health check in its own right.
- **Cons:** depends on the backend deployment being up. That is acceptable: if the backend
  is down, the shop is down anyway, and the failed run says so.

### Option C — Vercel Cron instead of GitHub Actions

- **Pros:** no 60-day auto-disable.
- **Cons:** Hobby plan allows only one run per day, with ±59 min precision. It could be
  added later as a second caller of the same endpoint.

## Chosen Solution

### Endpoint: `GET /api/health/db`

- `AppService.getDatabaseHealth()` runs `select id from categories limit 1` through
  `SupabaseService.getClient()`, the service_role data client. `categories` is small and
  always seeded. The method returns `HealthResponseDto` (`{ status, timestamp }`) on
  success and throws `503 Service Unavailable` on failure.
- **Unauthenticated.** It returns no data and the query stops after one row. Anyone can
  already trigger reads through public endpoints such as `GET /api/categories`.
- **No session side effects.** `SessionMiddleware` runs on every `api/*` route. For a GET
  with no `session_id` cookie whose path does not match `/cart`, `/favorites`, `/orders`,
  `/auth/me` or `/user/`, it calls `next()` without touching the database. The workflow's
  `curl` sends no cookie, so the ping never creates `sessions` rows.
- The response body never includes driver errors. They go to the server log only.
- `Cache-Control: no-store`, so no CDN layer can answer the request without reaching the
  database.

### Workflow: `.github/workflows/supabase-keep-alive.yml`

- Cron `17 3,15 * * *`: **twice a day**, at minute 17 to avoid top-of-hour delays.
  Fourteen requests per 7-day window, so a few dropped runs still leave a wide margin.
- `workflow_dispatch` for manual runs.
- `curl --fail-with-body --retry 3 --retry-delay 10 --retry-all-errors --max-time 30`, so
  serverless cold starts are retried and a non-2xx response fails the job.
- `permissions: contents: read`. No secrets are needed.
- Backend URL is set as a workflow-level `env` (`https://papa-bread-api.vercel.app`). It is
  public and already listed in the README.
- Separate from `ci.yml`. CI runs on push and pull request; this workflow only runs on its
  schedule or by hand.

## Risks

| Risk                                                             | Mitigation                                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub disables the schedule after 60 days without repo activity | Any push resets the clock. If it is disabled, re-enable it from the Actions tab. Supabase's warning email one week before a pause is the backstop |
| GitHub drops some scheduled runs                                 | Twice-daily schedule gives a large margin over the 7-day window                                                                                   |
| Supabase changes what counts as activity                         | The ping is a real PostgREST query on a user table, the same as real traffic                                                                      |
| `categories` is emptied                                          | The query still succeeds with zero rows, and it still counts as activity                                                                          |

## Sources

- [Supabase — Project Pausing][supabase-pausing]
- [GitHub Docs — Events that trigger workflows: `schedule`][gha-schedule]
- [Vercel — Cron Jobs usage & pricing][vercel-cron]
- [travisvn/supabase-pause-prevention][travisvn]
- [OpenSourcePatents/Supabase_Keepalive][oss-keepalive]
- [dev.to — Prevent your Supabase project database from being paused using GitHub Actions][devto-gha]

[supabase-pausing]: https://supabase.com/docs/guides/platform/free-project-pausing
[gha-schedule]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[vercel-cron]: https://vercel.com/docs/cron-jobs/usage-and-pricing
[travisvn]: https://github.com/travisvn/supabase-pause-prevention
[oss-keepalive]: https://github.com/OpenSourcePatents/Supabase_Keepalive
[devto-gha]: https://dev.to/jps27cse/how-to-prevent-your-supabase-project-database-from-being-paused-using-github-actions-3hel
