// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { Response } from 'express';

/**
 * How a search response may be cached by browsers and shared caches.
 */
export interface SearchCachePolicy {
  /** `false` for responses that report indexer errors, which must not be reused. */
  isCacheable: boolean;
  /** Responses that embed an API key in download links must stay out of shared caches. */
  isPrivate: boolean;
  ttlSeconds: number;
}

/**
 * Sets `Cache-Control`, `Vary` and `X-Cache` for a search or feed response. `X-Cache` is left out
 * when `cacheStatus` is `undefined`, for responses answered without consulting the cache.
 */
export function setSearchCacheHeaders(
  res: Response,
  cacheStatus: 'HIT' | 'MISS' | undefined,
  policy: SearchCachePolicy
): void {
  const setCacheStatus = (): void => {
    if (cacheStatus) res.setHeader('X-Cache', cacheStatus);
  };
  if (!policy.isCacheable) {
    res.setHeader('Cache-Control', 'no-store');
    setCacheStatus();
    return;
  }
  if (policy.ttlSeconds <= 0) {
    return;
  }

  if (policy.isPrivate) {
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Vary', 'Accept-Encoding, Cookie, X-Api-Key');
  } else {
    res.setHeader(
      'Cache-Control',
      `public, max-age=60, s-maxage=${policy.ttlSeconds}, stale-while-revalidate=600`
    );
  }
  setCacheStatus();
}
