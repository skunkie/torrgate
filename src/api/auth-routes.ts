// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Router } from 'express';

import { getQueryString } from '../utils/query.js';
import { sendLoginPage } from './login-page.js';
import { createSessionToken, getClientId, isAuthenticated, SESSION_COOKIE_NAME, timingSafeCompare } from './middleware/auth.js';
import { IndexerRouterOptions } from './routes.js';

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

export function createAuthRouter(options: IndexerRouterOptions): Router {
  const router = Router();
  const authLimiter = options.authLimiter;

  router.get('/login', (req, res) => {
    if (!options.apiKey || isAuthenticated(req, options.apiKey, authLimiter)) {
      res.redirect(normalizeReturnUrl(getQueryString(req.query, 'returnUrl'), '/'));
      return;
    }
    sendLoginPage(res, 200, { returnUrl: getQueryString(req.query, 'returnUrl') });
  });

  router.post('/login', (req, res) => {
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

  router.all('/logout', (_req, res) => {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
    res.redirect(302, '/login');
  });

  return router;
}
