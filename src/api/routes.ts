// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Router } from 'express';

import { ProviderRegistry } from '../providers/registry.js';
import { CacheStore } from '../utils/cache.js';
import { FailedAttemptLimiter } from '../utils/rate-limiter.js';
import { asyncHandler } from './async-handler.js';
import { CategoryController } from './controllers/category.controller.js';
import { DownloadController } from './controllers/download.controller.js';
import { ProviderController } from './controllers/provider.controller.js';
import { RssController } from './controllers/rss.controller.js';
import { SearchController } from './controllers/search.controller.js';
import { apiKeyAuth } from './middleware/auth.js';

/**
 * Options for configuring the indexers router.
 */
export interface IndexerRouterOptions {
  apiKey?: string;
  /** Shared across API routes and the sign-in form so wrong keys count toward one limit per client. */
  authLimiter?: FailedAttemptLimiter;
  cache?: CacheStore<unknown>;
  cacheTtlSeconds?: number;
  corsOrigin?: string;
  /** Express `trust proxy` value, needed to see real client addresses behind a reverse proxy. */
  trustProxy?: TrustProxySetting;
}

/**
 * Value accepted by Express's `trust proxy` setting: all proxies, a hop count, or an address list.
 */
export type TrustProxySetting = boolean | number | string;

/**
 * Normalizes indexer router options from string or options object.
 */
export function normalizeIndexerRouterOptions(
  optionsOrApiKey?: IndexerRouterOptions | string
): IndexerRouterOptions {
  if (typeof optionsOrApiKey === 'string') {
    return { apiKey: optionsOrApiKey };
  }
  return optionsOrApiKey || {};
}

/**
 * Creates and mounts all routes under the canonical Jackett REST v2.0 path space (/api/v2.0/indexers/).
 */
export function createIndexersRouter(
  registry: ProviderRegistry,
  optionsOrApiKey?: IndexerRouterOptions | string
): Router {
  const options = normalizeIndexerRouterOptions(optionsOrApiKey);

  const router = Router();

  if (options.apiKey) {
    router.use(apiKeyAuth(options.apiKey, options.authLimiter));
  }

  const categoryController = new CategoryController(registry);
  const downloadController = new DownloadController(registry);
  const providerController = new ProviderController(registry);
  const rssController = new RssController(
    registry,
    options.cache,
    options.cacheTtlSeconds,
    options.apiKey
  );
  const searchController = new SearchController(
    registry,
    options.cache,
    options.cacheTtlSeconds,
    options.apiKey
  );

  // Indexer listing and availability
  router.get('/', asyncHandler(providerController.list));
  router.get('/check', asyncHandler(providerController.check));
  router.get('/status', asyncHandler(providerController.check));

  // Search results and Torznab feeds
  router.get('/:indexer/results', asyncHandler(searchController.searchByTitle));
  router.get('/:indexer/results/torznab', asyncHandler(rssController.getRss));
  router.get('/:indexer/results/torznab/api', asyncHandler(rssController.getRss));

  // Direct .torrent download proxy and magnet URI extraction from the .torrent file
  router.get('/:indexer/download', asyncHandler(downloadController.download));
  router.get('/:indexer/magnet', asyncHandler(downloadController.magnet));

  // Category mappings and topic details
  router.get('/:indexer/categories', asyncHandler(categoryController.getCategories));
  router.get('/:indexer/details/:id', asyncHandler(searchController.searchById));

  return router;
}
