// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { MemoryCache } from './memory-cache.js';
import { BatchCacheStore, CacheStore } from './store.js';
import { UpstashRedisCache } from './upstash-cache.js';

const TOPIC_PATH_STORES = new WeakMap<CacheStore, MemoryCache<string>>();

/** Topic paths use a small byte budget and periodic cleanup even for standalone providers. */
export function createTopicPathCache(): MemoryCache<string> {
  return new MemoryCache<string>(300, Infinity, 60, 4 * 1024 * 1024);
}

/** Providers using the same backend share one local topic-path memory budget. */
export function getLocalTopicPathStore(store: CacheStore): MemoryCache<string> {
  let topicPaths = TOPIC_PATH_STORES.get(store);
  if (!topicPaths) {
    topicPaths = createTopicPathCache();
    TOPIC_PATH_STORES.set(store, topicPaths);
  }
  return topicPaths;
}

/** Topic paths have a separate byte budget so they cannot evict cached responses. */
export function getTopicPathStore(store: CacheStore): BatchCacheStore {
  if (store instanceof UpstashRedisCache) return store.createHashStore('topic-paths:v2');
  if (!(store instanceof MemoryCache)) {
    throw new Error('Topic-path storage supports only MemoryCache and UpstashRedisCache');
  }
  return getLocalTopicPathStore(store);
}
