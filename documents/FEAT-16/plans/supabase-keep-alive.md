# Supabase Keep-Alive — Plan

## Document Information

- **Ticket:** FEAT-16
- **Created:** 2026-11-03
- **Revised:** 2026-11-03 — switched the scheduler from GitHub Actions to Vercel Cron
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
- A paused project can be restored for **up to 1 year** after it was paused.
- Paid-plan projects are never paused for inactivity.

The docs say nothing about whether scheduled pings are allowed. They also do not list jobs
running inside the database as activity. The plan therefore relies on real API requests
from outside the database.

### Common approaches

| Approach                       | How it works                                                                                                                                                             | Notes                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| GitHub Actions → Supabase REST | A scheduled workflow `curl`s `https://<ref>.supabase.co/rest/v1/<table>` with a project key from repo secrets ([dev.to][devto-gha], [Supabase Keepalive][oss-keepalive]) | The most common recipe. Needs a Supabase key stored in GitHub |
| App endpoint + scheduler       | The app exposes an endpoint that **must make a database call** and must not be cached; a scheduler calls it ([supabase-pause-prevention][travisvn])                      | Keeps DB credentials inside the app                           |
| Vercel Cron                    | `crons` entries in `vercel.json` call a path on the production deployment                                                                                                | Hobby plan: once per day per job, ±59 min                     |
| External uptime monitor        | UptimeRobot, cron-job.org, etc. hitting an endpoint                                                                                                                      | Another account to manage; config lives outside the repo      |

### Scheduler: GitHub Actions

From GitHub's [schedule event docs][gha-schedule]:

1. **60-day auto-disable.** "In a public repository, scheduled workflows are automatically
   disabled when no repository activity has occurred in 60 days." This repo is public.
2. **No advance warning found.** Community reports only mention a banner on the Actions tab
   after the workflow is already disabled ([gh-action-keepalive][efrecon]). A disabled
   workflow does not run, so it does not fail, so no failure email is sent.
3. **Runs can be late or dropped** under load, especially at the top of the hour.
4. The best-known workaround, `gautamkrishnar/keepalive-workflow`, has been disabled by
   GitHub Staff "due to a violation of GitHub's terms of service".

### Scheduler: Vercel Cron on the Hobby plan

From the Vercel docs ([Cron Jobs][vercel-cron], [Managing Cron Jobs][vercel-cron-manage],
[Usage & Pricing][vercel-cron-pricing]):

- Vercel sends an HTTP `GET` to the **production** deployment URL plus the job's `path`,
  with user agent `vercel-cron/1.0`. Schedules are always UTC.
- **Hobby:** each job may run at most **once per day**, and fires anywhere within the
  scheduled hour. Up to 100 jobs per project, and several jobs may share one `path`.
- Delivery is **best effort**: a run can occasionally be missed, and failed runs are not
  retried.
- Jobs stop only when someone clicks **Disable Cron Jobs**, or when the project itself is
  paused.

When can a Hobby project be paused? Vercel lists four causes: usage limits, policy
violations, platform incidents, and billing problems
([Why has my account or deployment been paused?][vercel-paused]). Inactivity is not one of
them. The current production deployment is never removed by the deployment retention
policy ([changelog][vercel-retention]).

## Why the First Implementation Was Replaced

The first implementation used a GitHub Actions schedule. A manual run confirmed it worked
on 2026-11-03. It was replaced the same day because of the 60-day rule.

The weeks when nobody pushes to the repo are likely the same weeks when nobody uses the
shop, and that is exactly when the keep-alive is needed. The failure would also be silent:
after the last push, GitHub disables the schedule on day 60 with no failure email, and
Supabase pauses the idle database around day 67.

Vercel Cron has no equivalent inactivity rule.

## Options Considered

### Option A — GitHub Actions → Supabase REST directly

- **Pros:** most common recipe.
- **Cons:** the 60-day auto-disable described above. It also needs the `service_role` key
  in GitHub secrets. That key bypasses RLS and would expose customer PII in `orders` and
  `profiles` if leaked.

### Option B — GitHub Actions → backend endpoint (first implementation, replaced)

- **Pros:** no credentials in GitHub; failed runs send an email.
- **Cons:** the 60-day auto-disable.

### Option C — Vercel Cron → backend endpoint (chosen)

- **Pros:** no inactivity timer. Lives in the same deployment as the endpoint. No new
  account, and the schedule is version-controlled in `backend/vercel.json`.
- **Cons:** at most once per day per job on Hobby; best-effort delivery; no failure email.
  The first two are covered by running three jobs. The third is covered by Supabase's own
  warning email (see Risks).

### Option D — External uptime monitor

- **Pros:** frequent checks and failure alerts.
- **Cons:** a third-party account, with its configuration outside the repo. Can be added
  later on top of Option C without code changes.

## Chosen Solution

### Endpoint: `GET /api/health/db`

This is unchanged from the first implementation.

- `AppService.getDatabaseHealth()` runs `select id from categories limit 1` through
  `SupabaseService.getClient()`, the service_role data client. `categories` is small and
  always seeded. The method returns `HealthResponseDto` (`{ status, timestamp }`) on
  success and throws `503 Service Unavailable` on failure.
- **Unauthenticated.** It returns no data and the query stops after one row. Anyone can
  already trigger reads through public endpoints such as `GET /api/categories`. The
  endpoint therefore does not check `CRON_SECRET`.
- **No session side effects.** `SessionMiddleware` runs on every `api/*` route. For a GET
  with no `session_id` cookie whose path does not match `/cart`, `/favorites`, `/orders`,
  `/auth/me` or `/user/`, it calls `next()` without touching the database. Vercel Cron
  sends no cookie, so the ping never creates `sessions` rows.
- The response body never includes driver errors. They go to the server log only.
- `Cache-Control: no-store`. Vercel does not log cron runs that receive a cached response,
  and a cached response would not reach the database.

### Schedule: three Vercel Cron jobs

Added to the existing `backend/vercel.json`:

```json
"crons": [
  { "path": "/api/health/db", "schedule": "0 1 * * *" },
  { "path": "/api/health/db", "schedule": "0 9 * * *" },
  { "path": "/api/health/db", "schedule": "0 17 * * *" }
]
```

- **Three jobs on the same path, eight hours apart.** Each one stays within the Hobby limit
  of once per day.
- This matches Supabase's "a few requests each day" and gives 21 attempts per 7-day window.
  Missed runs are not retried, so the margin matters.

`backend/vercel.json` already uses the current `functions` + `rewrites` format (since
REFACTOR-3), so `crons` is the only change. The existing `rewrites` rule routes
`/api/health/db` to the NestJS function, the same as any other request.

## Risks

| Risk                                                                     | Mitigation                                                                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel misses a run                                                      | Three runs a day; missing several days in a row would be needed to reach 7 idle days                                                  |
| Cron failures are silent (no email; Hobby keeps runtime logs for 1 hour) | Supabase emails a warning about a week before pausing. `curl https://papa-bread-api.vercel.app/api/health/db` checks the path by hand |
| Vercel pauses the project for usage limits                               | The shop is down in that case anyway. Keep-alive traffic is under 100 invocations a month against a 1,000,000 Hobby allowance         |
| Supabase changes what counts as activity                                 | The ping is a real PostgREST query on a user table, the same as real traffic                                                          |

## Sources

- [Supabase — Project Pausing][supabase-pausing]
- [Vercel — Cron Jobs][vercel-cron], [Managing Cron Jobs][vercel-cron-manage], [Usage & Pricing][vercel-cron-pricing]
- [Vercel — Why has my account or deployment been paused?][vercel-paused]
- [Vercel — Hobby deployment retention changelog][vercel-retention]
- [GitHub Docs — Events that trigger workflows: `schedule`][gha-schedule]
- [efrecon/gh-action-keepalive][efrecon]
- [travisvn/supabase-pause-prevention][travisvn]
- [OpenSourcePatents/Supabase_Keepalive][oss-keepalive]
- [dev.to — Prevent your Supabase project database from being paused using GitHub Actions][devto-gha]

[supabase-pausing]: https://supabase.com/docs/guides/platform/free-project-pausing
[vercel-cron]: https://vercel.com/docs/cron-jobs
[vercel-cron-manage]: https://vercel.com/docs/cron-jobs/manage-cron-jobs
[vercel-cron-pricing]: https://vercel.com/docs/cron-jobs/usage-and-pricing
[vercel-paused]: https://vercel.com/kb/guide/why-is-my-account-deployment-blocked
[vercel-retention]: https://vercel.com/changelog/hobby-projects-now-retain-fewer-deployments-to-free-up-storage
[gha-schedule]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[efrecon]: https://github.com/efrecon/gh-action-keepalive
[travisvn]: https://github.com/travisvn/supabase-pause-prevention
[oss-keepalive]: https://github.com/OpenSourcePatents/Supabase_Keepalive
[devto-gha]: https://dev.to/jps27cse/how-to-prevent-your-supabase-project-database-from-being-paused-using-github-actions-3hel
