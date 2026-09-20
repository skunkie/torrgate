// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import path from 'node:path';

import express from 'express';

import {
  createSessionToken,
  getClientId,
  isAuthenticated,
  SESSION_COOKIE_NAME,
  timingSafeCompare,
} from './api/middleware/auth.js';
import { errorHandler } from './api/middleware/error-handler.js';
import { createIndexersRouter, IndexerRouterOptions, normalizeIndexerRouterOptions } from './api/routes.js';
import { renderLoginPage } from './api/views/login.js';
import { LOGIN_PAGE_STYLES } from './api/views/login-styles.js';
import {
  generateFaviconIco,
  generatePngIcon,
  getIconLinkTags,
  getIconSvg,
  getIconVersion,
  getManifest,
  getServiceWorker,
} from './api/views/pwa.js';
import { THEME_SCRIPT } from './api/views/theme-script.js';
import { THEME_STYLES } from './api/views/theme-styles.js';
import { renderWebClientPage } from './api/views/web-client.js';
import { WEB_CLIENT_SCRIPT } from './api/views/web-client-script.js';
import { WEB_CLIENT_STYLES } from './api/views/web-client-styles.js';
import { getUnprotectedAccountWarning, loadConfig } from './config/config.js';
import { HttpClient } from './http/http-client.js';
import { ProviderRegistry } from './providers/registry.js';
import { createCacheFromConfig, UpstashRedisCache } from './utils/cache.js';
import { getOpenApiSpec } from './utils/openapi.js';
import { getQueryString } from './utils/query.js';
import { FailedAttemptLimiter } from './utils/rate-limiter.js';

/**
 * The API reference script, pinned to one release and checked with Subresource Integrity:
 * the docs page shares the API's origin, so the script can make authenticated requests.
 */
const SCALAR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.71.0/dist/browser/standalone.js';
const SCALAR_SCRIPT_INTEGRITY = 'sha384-I7aSmSxf06vl5HT10vzNOAryO+PFCAVHIGwhZerHn6yM/O0642381S3kw9o7fFQd';

/**
 * CSP directives shared by every HTML page: no framing, no `<base>` rewriting, and forms
 * that only post back to TorrGate.
 */
const BASE_PAGE_POLICY = "base-uri 'none'; form-action 'self'; frame-ancestors 'none';";

const LOGIN_PAGE_POLICY = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; ${BASE_PAGE_POLICY}`;

const ALLOWED_RETURN_PATHS = new Set(['/', '/api/v2.0/indexers/docs', '/docs']);

function normalizeReturnUrl(returnUrl: string | undefined, fallback: string = '/'): string {
  if (!returnUrl) {
    return fallback;
  }
  try {
    const baseUrl = new URL('http://localhost');
    const resolvedUrl = new URL(returnUrl, baseUrl);
    if (resolvedUrl.origin !== baseUrl.origin || !ALLOWED_RETURN_PATHS.has(resolvedUrl.pathname)) {
      return fallback;
    }
    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Sends the sign-in page with its locked-down Content-Security-Policy.
 */
function sendLoginPage(
  res: express.Response,
  statusCode: number,
  options: { error?: string; returnUrl?: string }
): void {
  res.status(statusCode);
  res.setHeader('Content-Security-Policy', LOGIN_PAGE_POLICY);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderLoginPage({ action: '/login', ...options }));
}

export function createApp(
  registry: ProviderRegistry,
  optionsOrApiKey?: IndexerRouterOptions | string
): express.Application {
  const normalizedOptions = normalizeIndexerRouterOptions(optionsOrApiKey);
  const options: IndexerRouterOptions = {
    ...normalizedOptions,
    authLimiter: normalizedOptions.authLimiter ?? new FailedAttemptLimiter(),
  };
  const authLimiter = options.authLimiter;

  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy !== undefined) {
    app.set('trust proxy', options.trustProxy);
  }

  // Baseline hardening for every response. Download and feed URLs can carry the API key,
  // so no Referer is sent from TorrGate pages.
  app.use((_req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Standard body parsers for login form submission
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  // Basic CORS headers
  const corsOrigin = options.corsOrigin || '*';
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', corsOrigin);
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Api-Key');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/login', (req, res) => {
    if (!options.apiKey || isAuthenticated(req, options.apiKey, authLimiter)) {
      res.redirect(normalizeReturnUrl(getQueryString(req.query, 'returnUrl'), '/'));
      return;
    }
    sendLoginPage(res, 200, { returnUrl: getQueryString(req.query, 'returnUrl') });
  });

  app.post('/login', (req, res) => {
    if (!options.apiKey) {
      res.redirect(normalizeReturnUrl(getQueryString(req.body ?? {}, 'returnUrl'), '/'));
      return;
    }

    const clientId = getClientId(req);
    const returnUrl = getQueryString(req.body ?? {}, 'returnUrl') ?? '/';

    if (authLimiter?.isBlocked(clientId)) {
      sendLoginPage(res, 429, { error: 'Too many login attempts. Please try again later.', returnUrl });
      return;
    }

    const submittedKey = getQueryString(req.body ?? {}, 'apiKey') ?? '';

    if (timingSafeCompare(submittedKey, options.apiKey)) {
      authLimiter?.reset(clientId);
      const token = createSessionToken(options.apiKey);
      const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const secureFlag = isSecure ? '; Secure' : '';
      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureFlag}`
      );
      res.redirect(302, normalizeReturnUrl(returnUrl, '/'));
      return;
    }

    authLimiter?.recordFailure(clientId);

    sendLoginPage(res, 401, {
      error: 'Invalid API key. Please check your credentials and try again.',
      returnUrl,
    });
  });

  app.all('/logout', (_req, res) => {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
    res.redirect(302, '/login');
  });

  // PWA Manifest, Service Worker, and App Icons
  app.get('/manifest.webmanifest', (_req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(getManifest());
  });

  app.get('/sw.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(getServiceWorker());
  });

  const iconRoutes: { contentType: string; paths: string[]; render: () => Buffer | string }[] = [
    { contentType: 'image/svg+xml', paths: ['/icon.svg'], render: getIconSvg },
    {
      contentType: 'image/png',
      paths: ['/icon-192.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'],
      render: () => generatePngIcon(192),
    },
    { contentType: 'image/png', paths: ['/icon-512.png'], render: () => generatePngIcon(512) },
    { contentType: 'image/x-icon', paths: ['/favicon.ico'], render: generateFaviconIco },
  ];

  for (const route of iconRoutes) {
    let body: Buffer | string | undefined;
    app.get(route.paths, (req, res) => {
      body ??= route.render();
      const isVersioned = getQueryString(req.query, 'v') === getIconVersion();
      res.setHeader('Content-Type', route.contentType);
      res.setHeader('Cache-Control', isVersioned ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
      res.send(body);
    });
  }

  // Serve raw OpenAPI YAML
  app.get('/api/v2.0/indexers/openapi.yaml', (req, res) => {
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

  app.get('/web-client.css', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.send(`${THEME_STYLES}${WEB_CLIENT_STYLES}`);
  });

  app.get('/web-client.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(WEB_CLIENT_SCRIPT);
  });

  app.get('/login.css', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.send(`${THEME_STYLES}${LOGIN_PAGE_STYLES}`);
  });

  app.get('/theme.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.send(THEME_SCRIPT);
  });

  // Interactive documentation via Scalar API reference
  const renderDocs = (req: express.Request, res: express.Response): void => {
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
        background: #18181b;
        border: 1px solid #27272a;
        color: #a1a1aa;
        padding: 6px 12px;
        border-radius: 8px;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        font-weight: 500;
        text-decoration: none;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }
      .scalar-signout:hover {
        background: #202024;
        color: #f4f4f5;
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

  app.get('/', (req, res) => {
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

  app.get('/docs', renderDocs);
  app.get('/api/v2.0/indexers/docs', renderDocs);

  // Mount canonical Jackett REST v2.0 indexers router
  app.use('/api/v2.0/indexers', createIndexersRouter(registry, options));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'NotFound',
      message: `Cannot ${req.method} ${req.path}`,
      statusCode: 404,
      success: false,
    });
  });

  // Error handling middleware
  app.use(errorHandler);

  return app;
}

export function buildApp(): express.Application {
  const config = loadConfig();
  const unprotectedAccountWarning = getUnprotectedAccountWarning(config);
  if (unprotectedAccountWarning) {
    console.warn(unprotectedAccountWarning);
  }
  const httpClient = new HttpClient(config.proxy, config.requestTimeoutMs);
  const registry = new ProviderRegistry(httpClient);
  const cache = createCacheFromConfig(config);
  if (cache instanceof UpstashRedisCache) {
    registry.shareRequestDelays(cache);
  }

  return createApp(registry, {
    apiKey: config.apiKey,
    cache,
    cacheTtlSeconds: config.cacheTtlSeconds,
    trustProxy: config.trustProxy,
  });
}

let cachedApp: express.Application | null = null;

export function getApp(): express.Application {
  if (!cachedApp) {
    cachedApp = buildApp();
  }
  return cachedApp;
}

export const app: express.Application = new Proxy((() => {}) as unknown as express.Application, {
  apply(_target, thisArg, argArray) {
    const instance = getApp();
    return Reflect.apply(instance as unknown as (...args: unknown[]) => unknown, thisArg, argArray);
  },
  get(_target, prop, receiver) {
    const instance = getApp();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

export default app;
