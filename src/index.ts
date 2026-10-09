// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import express from 'express';

import { createAssetRouter } from './api/asset-routes.js';
import { createAuthRouter } from './api/auth-routes.js';
import { errorHandler } from './api/middleware/error-handler.js';
import { createPageRouter } from './api/page-routes.js';
import { createIndexersRouter, IndexerRouterOptions, normalizeIndexerRouterOptions } from './api/routes.js';
import { createCacheFromConfig } from './cache/factory.js';
import { UpstashRedisCache } from './cache/upstash-cache.js';
import { getUnprotectedAccountWarning, loadConfig } from './config/config.js';
import { HttpClient } from './http/http-client.js';
import { ProviderRegistry } from './providers/registry.js';
import { FailedAttemptLimiter } from './utils/failed-attempt-limiter.js';

export function createApp(
  registry: ProviderRegistry,
  optionsOrApiKey?: IndexerRouterOptions | string
): express.Application {
  const normalizedOptions = normalizeIndexerRouterOptions(optionsOrApiKey);
  const options: IndexerRouterOptions = {
    ...normalizedOptions,
    authLimiter: normalizedOptions.authLimiter ?? new FailedAttemptLimiter(),
  };

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

  app.use(createAuthRouter(options));
  app.use(createAssetRouter());
  app.use(createPageRouter(options));

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
  const httpClient = new HttpClient(config.proxy, config.requestTimeoutMs, config.maxConcurrentRequests);
  const registry = new ProviderRegistry(httpClient);
  const cache = createCacheFromConfig(config);
  if (cache instanceof UpstashRedisCache) {
    registry.shareRequestDelays(cache);
  }

  return createApp(registry, {
    apiKey: config.apiKey,
    cache,
    cacheTtlSeconds: config.cacheTtlSeconds,
    corsOrigin: config.corsOrigin,
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
