// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { CacheWrite } from '../cache/store.js';
import { TrackerProvider } from '../types/provider.js';
import { TorrentItem } from '../types/torrent.js';

export interface CachedSearchResponse<T> {
  response: T;
  topicPaths: Record<string, CacheWrite<string>[]>;
}

export function collectTopicPath(
  topicPaths: CachedSearchResponse<unknown>['topicPaths'],
  provider: TrackerProvider | undefined,
  item: TorrentItem
): void {
  const entry = provider?.getTopicPathCacheEntry?.(item);
  if (!entry || !provider) return;
  const providerId = (provider.id || provider.name).toLowerCase();
  if (!Object.hasOwn(topicPaths, providerId)) {
    Object.defineProperty(topicPaths, providerId, {
      configurable: true,
      enumerable: true,
      value: [],
      writable: true,
    });
  }
  topicPaths[providerId].push(entry);
}
