// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { ServerConfig } from '../types/config.js';
import { MemoryCache } from './memory-cache.js';
import { CacheStore } from './store.js';
import { UpstashRedisCache } from './upstash-cache.js';

/**
 * Creates an appropriate CacheStore instance based on server configuration.
 * Uses Upstash Redis when REST credentials are provided, falls back to MemoryCache.
 */
export function createCacheFromConfig(config: ServerConfig): CacheStore<unknown> | undefined {
  if (config.kvRestApiUrl && config.kvRestApiToken) {
    return new UpstashRedisCache<unknown>(
      config.kvRestApiUrl,
      config.kvRestApiToken,
      config.cacheTtlSeconds
    );
  }

  if (config.cacheTtlSeconds > 0) {
    return new MemoryCache<unknown>(config.cacheTtlSeconds);
  }

  return undefined;
}
