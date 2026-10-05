// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import path from 'node:path';

import { Request, Response, Router } from 'express';

import { getOpenApiSpec } from '../utils/openapi.js';
import { sendLoginPage } from './login-page.js';
import { isAuthenticated } from './middleware/auth.js';
import { BASE_PAGE_POLICY } from './page-policy.js';
import { IndexerRouterOptions } from './routes.js';
import { getIconLinkTags } from './views/pwa.js';
import { renderWebClientPage } from './views/web-client.js';

/**
 * The API reference script, pinned to one release and checked with Subresource Integrity:
 * the docs page shares the API's origin, so the script can make authenticated requests.
 */
const SCALAR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.71.0/dist/browser/standalone.js';
const SCALAR_SCRIPT_INTEGRITY = 'sha384-I7aSmSxf06vl5HT10vzNOAryO+PFCAVHIGwhZerHn6yM/O0642381S3kw9o7fFQd';

export function createPageRouter(options: IndexerRouterOptions): Router {
  const router = Router();
  const authLimiter = options.authLimiter;

  // Serve raw OpenAPI YAML
  router.get('/api/v2.0/indexers/openapi.yaml', (req, res) => {
    if (options.apiKey && !isAuthenticated(req, options.apiKey, authLimiter)) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required to access OpenAPI specification',
        statusCode: 401,
        success: false,
      });
      return;
    }

    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    try {
      res.send(getOpenApiSpec());
    } catch {
      res.sendFile(path.resolve(process.cwd(), 'openapi.yaml'));
    }
  });

  // Interactive documentation via Scalar API reference
  const renderDocs = (req: Request, res: Response): void => {
    if (options.apiKey && !isAuthenticated(req, options.apiKey, authLimiter)) {
      sendLoginPage(res, 401, { returnUrl: req.originalUrl });
      return;
    }

    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' ${SCALAR_SCRIPT_URL}; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com https://fonts.scalar.com data:; img-src 'self' data: https:; worker-src 'self' blob:; connect-src 'self'; ${BASE_PAGE_POLICY}`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const signOutHtml = options.apiKey
      ? `<style>
      .scalar-signout {
        position: fixed;
        top: 12px;
        right: 16px;
        z-index: 1000;
        display: flex;
        gap: 6px;
        align-items: center;
        padding: 6px 12px;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        font-weight: 500;
        color: #a1a1aa;
        text-decoration: none;
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        transition: all 0.15s ease;
      }
      .scalar-signout:hover {
        color: #f4f4f5;
        background: #202024;
        border-color: #3f3f46;
      }
    </style>
    <a href="/logout" class="scalar-signout" title="Sign out of documentation">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
      Sign out
    </a>`
      : '';

    res.send(`<!doctype html>
<html>
  <head>
    <title>TorrGate API Reference</title>
    ${getIconLinkTags()}
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    ${signOutHtml}
    <script id="api-reference" data-url="/api/v2.0/indexers/openapi.yaml"></script>
    <script src="${SCALAR_SCRIPT_URL}" integrity="${SCALAR_SCRIPT_INTEGRITY}" crossorigin="anonymous"></script>
  </body>
</html>`);
  };

  router.get('/', (req, res) => {
    if (options.apiKey && !isAuthenticated(req, options.apiKey, authLimiter)) {
      res.redirect('/login');
      return;
    }

    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; ${BASE_PAGE_POLICY}`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderWebClientPage({ hasAuth: Boolean(options.apiKey) }));
  });

  router.get('/docs', renderDocs);
  router.get('/api/v2.0/indexers/docs', renderDocs);

  return router;
}
