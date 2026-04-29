# FIX-5 — Backend Home Page (Swagger UI) — Implementation Notes

Implements **Option B** from
[../plans/backend-home-page.md](../plans/backend-home-page.md): self-host the
OpenAPI JSON and serve a CDN-backed Swagger UI shell so the same code path
works on localhost and on Vercel.

## Files Touched

| File                                 | Change                                          |
| ------------------------------------ | ----------------------------------------------- |
| `backend/src/common/swagger-cdn.ts`  | **NEW** — helper that registers `GET /api-json` (spec) and `GET /` (CDN-backed UI HTML). |
| `backend/src/main.ts`                | Replaced `SwaggerModule.setup('/')` with `setupSwaggerCdn(app, document)`. |
| `backend/api/index.ts`               | Same swap as `main.ts`; removed the (non-functional) `customCssUrl` / `customJs` overrides. |

No changes to `backend/vercel.json`, route prefixes, middleware, or guards.
The `SessionMiddleware` continues to scope only to `api/*path`, so the new
`/api-json` route is exempt from session cookie creation, which matches the
intent of the existing pattern (sessions are created lazily on actual API
calls, not on docs lookups).

## 1. New helper — `backend/src/common/swagger-cdn.ts`

```ts
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { Request, Response } from 'express';

const SWAGGER_UI_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';
const SRI = {
  css: 'sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn',
  bundle: 'sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep',
  preset: 'sha384-2YH8WDRaj7V2OqU/trsmzSagmk/E2SutiCsGkdgoQwC9pNUJV1u/141DHB6jgs8t',
};

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const buildHtml = (specUrl: string, title: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="https://nestjs.com/favicon.ico">
  <link rel="stylesheet" href="${SWAGGER_UI_CDN}/swagger-ui.css" integrity="${SRI.css}" crossorigin="anonymous">
  <style>html,body{margin:0;background:#fafafa}.swagger-ui .topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_UI_CDN}/swagger-ui-bundle.js" integrity="${SRI.bundle}" crossorigin="anonymous"></script>
  <script src="${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.js" integrity="${SRI.preset}" crossorigin="anonymous"></script>
  <script>
    window.addEventListener('load', function () {
      window.ui = window.SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          window.SwaggerUIBundle.presets.apis,
          window.SwaggerUIStandalonePreset,
        ],
        layout: 'StandaloneLayout',
      });
    });
  </script>
</body>
</html>`;

export function setupSwaggerCdn(
  app: INestApplication,
  document: OpenAPIObject,
  options: { uiPath?: string; jsonPath?: string; title?: string } = {},
): void {
  const uiPath = options.uiPath ?? '/';
  const jsonPath = options.jsonPath ?? '/api-json';
  const title = options.title ?? 'Backend API Documentation';
  const html = buildHtml(jsonPath, title);

  const http = app.getHttpAdapter();
  http.get(jsonPath, (_req: Request, res: Response) => res.json(document));
  http.get(uiPath, (_req: Request, res: Response) => res.type('html').send(html));
}
```

Key points:

- `SWAGGER_UI_CDN` is pinned to `swagger-ui-dist@5.17.14`. Bumping the UI is a
  one-line change — but it must be paired with refreshing the three SRI hashes
  in the `SRI` object (see "Updating Swagger UI" below).
- All three CDN tags carry `integrity="sha384-..."` + `crossorigin="anonymous"`
  so a browser will refuse to execute / apply the asset if its bytes do not
  match the pinned hash. This protects against a CDN compromise serving
  modified JS.
- `escapeHtml(title)` defends the `<title>` interpolation from any future
  caller that passes a value containing HTML metacharacters.
- `buildHtml(specUrl, ...)` JSON-encodes `specUrl` with `JSON.stringify` so the
  `url:` value is always a safe JS string literal, not a raw interpolation.
- The helper is generic: defaults are `/` (HTML) and `/api-json` (spec), but
  callers can override `uiPath` / `jsonPath` / `title` via the `options`
  parameter.
- Routes are registered through `app.getHttpAdapter().get(...)` so they live
  outside Nest's controller routing, alongside how `SwaggerModule.setup`
  itself attaches its routes.

### Updating Swagger UI

To upgrade the pinned UI version, change `SWAGGER_UI_CDN` and recompute the
three SRI hashes:

```bash
VER=5.x.y
for f in swagger-ui.css swagger-ui-bundle.js swagger-ui-standalone-preset.js; do
  echo -n "$f: sha384-"
  curl -sf "https://cdn.jsdelivr.net/npm/swagger-ui-dist@$VER/$f" \
    | openssl dgst -sha384 -binary | openssl base64 -A
  echo
done
```

Paste the three hashes into the `SRI` constant and bump the version string.

## 2. `backend/src/main.ts`

```diff
 import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
 import { ValidationPipe } from '@nestjs/common';
 import cookieParser from 'cookie-parser';
+import { setupSwaggerCdn } from './common/swagger-cdn';
 ...
   const document = SwaggerModule.createDocument(app, config);
-  SwaggerModule.setup('/', app, document, {
-    customSiteTitle: 'Backend API Documentation',
-    customfavIcon: 'https://nestjs.com/favicon.ico',
-  });
+  setupSwaggerCdn(app, document);
```

`createDocument` is still called the same way, so any future controllers /
DTOs decorated with `@nestjs/swagger` decorators continue to be picked up
automatically.

## 3. `backend/api/index.ts` (Vercel entry)

```diff
 import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
 import cookieParser from 'cookie-parser';
 import { Request, Response } from 'express';
+import { setupSwaggerCdn } from '../src/common/swagger-cdn';
 ...
     const document = SwaggerModule.createDocument(app, config);
-    SwaggerModule.setup('/', app, document, {
-      customSiteTitle: 'Backend API Documentation',
-      customfavIcon: 'https://nestjs.com/favicon.ico',
-      customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css',
-      customJs: [
-        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js',
-        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js',
-      ],
-    });
+    setupSwaggerCdn(app, document);
```

Both entry points now produce the exact same Swagger response, eliminating
the local-vs-Vercel divergence that caused this bug.

## Verification

### Type-check

```
cd backend && npx tsc --noEmit
# (no output — passes)
```

### Local runtime (port 3000)

```
$ curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/
200 text/html; charset=utf-8

$ curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/api-json
200 application/json; charset=utf-8

$ curl -s http://localhost:3000/ | grep -E '\./swagger' || echo "no relative refs"
no relative refs

$ curl -s http://localhost:3000/ | grep -E '(jsdelivr|integrity)'
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" integrity="sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn" crossorigin="anonymous">
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" integrity="sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js" integrity="sha384-2YH8WDRaj7V2OqU/trsmzSagmk/E2SutiCsGkdgoQwC9pNUJV1u/141DHB6jgs8t" crossorigin="anonymous"></script>

$ curl -s http://localhost:3000/api-json | head -c 80
{"openapi":"3.0.0","paths":{"/api/health":{"get":{"description":"Returns the
```

- `/` returns HTML that references **only** CDN URLs — no more `./swagger-ui.css`
  or `./swagger-ui-bundle.js` lookups against the lambda.
- `/api-json` returns a valid OpenAPI 3.0 document.

### Vercel deploy

After redeploying the `backend/` Vercel project, opening
`https://papa-bread-api.vercel.app/` should render the Swagger UI identically
to local dev. The browser fetches `swagger-ui-dist` assets from
`cdn.jsdelivr.net` and the spec from `/api-json` (same-origin, served by the
serverless function).

## Rollback

Single-commit revert restores the previous `SwaggerModule.setup('/')` calls in
`backend/src/main.ts` and `backend/api/index.ts`, and removes
`backend/src/common/swagger-cdn.ts`. No DB / env / config changes were made.
