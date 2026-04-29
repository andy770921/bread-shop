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
