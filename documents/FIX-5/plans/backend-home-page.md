# FIX-5 — Backend Home Page (Swagger UI) Renders Blank on Vercel

## Summary

The deployed backend at `https://papa-bread-api.vercel.app/` returns HTTP 200 but
the page is visually blank. Locally (`npm run dev`, port 3000), the same route
renders the Swagger UI correctly.

## Root Cause

NestJS Swagger (`@nestjs/swagger@^11.2.6`) was mounted at `/` via
`SwaggerModule.setup('/', app, document, ...)`. The HTML it serves embeds
**relative paths** to its UI assets:

```html
<link rel="stylesheet" href="./swagger-ui.css">
<script src="./swagger-ui-bundle.js"></script>
<script src="./swagger-ui-standalone-preset.js"></script>
<script src="./swagger-ui-init.js"></script>
```

In local dev, NestJS pairs the HTML with an Express static handler that streams
those files out of `node_modules/swagger-ui-dist`. On Vercel, the backend ships
as a single serverless function (`backend/api/index.ts`) and Vercel's bundler
does not trace the static files inside `swagger-ui-dist` (they are loaded via
runtime `fs` reads, not `require`), so the lambda payload simply does not
contain them.

Reproduced with `curl`:

| Path                          | Status |
| ----------------------------- | ------ |
| `GET /`                       | 200    |
| `GET /swagger-ui.css`         | **404** |
| `GET /swagger-ui-bundle.js`   | **404** |
| `GET /swagger-ui-init.js`     | 200 (NestJS generates this dynamically) |

The bundle 404 means `window.SwaggerUIBundle` never exists, so `swagger-ui-init.js`
cannot mount the UI and `<div id="swagger-ui">` stays empty.

A previous attempt in `backend/api/index.ts` set `customCssUrl` and `customJs`
to a `cdnjs.cloudflare.com` URL, but those overrides were not actually injected
into the served HTML by this version of `@nestjs/swagger`, so the page kept
referencing the broken relative paths.

## Options Considered

### Option A — Bundle `swagger-ui-dist` into the Vercel function

Extend `backend/vercel.json`'s `functions["api/index.ts"].includeFiles` glob to
include the `swagger-ui-dist` package so the lambda contains the static files
and Express can serve them.

```jsonc
"functions": {
  "api/index.ts": {
    "includeFiles": "{../shared/**/*,../node_modules/swagger-ui-dist/**}"
  }
}
```

Pros:
- Smallest source-code change.
- Keeps the `SwaggerModule.setup('/')` API.

Cons:
- Increases lambda cold-start size (every request pays for static assets that
  could be served from a CDN).
- Path/glob is fragile: in this monorepo `swagger-ui-dist` may be hoisted to
  the workspace root `node_modules`, so the glob has to work for both the
  hoisted and non-hoisted layouts. Future Turborepo / npm-workspace changes
  can silently break it.
- Local dev and Vercel still take different code paths — the bug class
  reappears the next time something assumes "what works locally works on
  Vercel."

### Option B — Serve a CDN-backed Swagger UI shell ourselves (CHOSEN)

Stop using `SwaggerModule.setup` for HTML. Generate the OpenAPI document with
`SwaggerModule.createDocument`, expose the JSON at `/api-json`, and register a
small custom HTML route at `/` that loads `swagger-ui-dist` from
`cdn.jsdelivr.net` and points its `url` config at `/api-json`.

Pros:
- Works identically on local dev and Vercel — no environment-specific glue.
- Removes any dependency on the lambda containing `swagger-ui-dist` static
  files; smaller cold-starts.
- Trivial to upgrade Swagger UI: bump one version string.
- Avoids the `customCssUrl` / `customJs` rendering quirk in
  `@nestjs/swagger@11`.

Cons:
- Browsers must reach `cdn.jsdelivr.net` to render the docs UI (acceptable for
  internal API docs; the JSON spec is still served from our own origin).
- ~25 lines of HTML / setup code to maintain in-repo.

### Option C (rejected) — Move Swagger to `/docs`

Just changes which route is broken; does not fix the missing static assets.
Not pursued.

## Decision

Going with **Option B**. The server self-hosts only the OpenAPI JSON (which we
own and want versioned), and offloads the UI's static assets to a CDN that is
already maintained for this exact purpose. Same code path runs on localhost
and Vercel, which removes the "works locally, blank on prod" failure mode.

## Acceptance Criteria

- `GET /` returns HTML that mounts Swagger UI without 404s in the browser
  console (verified locally).
- `GET /api-json` returns the OpenAPI 3.0 document.
- After deploying `backend/` to Vercel, `https://papa-bread-api.vercel.app/`
  renders the same UI as local dev.
- No regression to existing API routes (`/api/...`) or to the session cookie
  middleware which is scoped to `api/*path`.
