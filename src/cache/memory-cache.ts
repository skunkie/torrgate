// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { CacheStore } from './store.js';

interface CacheEntry<T> {
  dependencies: readonly string[];
  expiresAt: number;
  sizeBytes: number;
  value: T;
}

export const DEFAULT_MEMORY_CACHE_BYTES = 64 * 1024 * 1024;

function estimateSizeBytes(key: string, value: unknown): number {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return Buffer.byteLength(key) + Buffer.byteLength(serialized);
}

/**
 * In-memory TTL cache with LRU eviction, bounded by both entry count and approximate size.
 * A value larger than the whole size budget is not stored.
 */
export class MemoryCache<T> implements CacheStore<T> {
  private readonly cleanupTimer?: NodeJS.Timeout;
  private readonly defaultTtlSeconds: number;
  private readonly maxEntries: number;
  private readonly maxSizeBytes: number;
  private readonly store = new Map<string, CacheEntry<T>>();
  private totalSizeBytes = 0;

  constructor(
    defaultTtlSeconds = 300,
    maxEntries = 500,
    cleanupIntervalSeconds = 0,
    maxSizeBytes = DEFAULT_MEMORY_CACHE_BYTES
  ) {
    this.defaultTtlSeconds = defaultTtlSeconds;
    this.maxEntries = maxEntries;
    this.maxSizeBytes = maxSizeBytes;
    if (cleanupIntervalSeconds > 0) {
      this.cleanupTimer = setInterval(() => {
        this.evictExpired();
      }, cleanupIntervalSeconds * 1000);
      this.cleanupTimer.unref?.();
    }
  }

  clear(): void {
    this.store.clear();
    this.totalSizeBytes = 0;
  }

  delete(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    this.store.delete(key);
    this.totalSizeBytes -= entry.sizeBytes;
    return true;
  }

  /**
   * Destroys the cache by stopping background cleanup and clearing all entries.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }

  /**
   * Evicts all expired entries from the cache and returns the number of evicted items.
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  get<R = T>(key: string): R | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }

    if (entry.dependencies.some(dependency => {
      const requiredEntry = this.store.get(dependency);
      return !requiredEntry || Date.now() > requiredEntry.expiresAt;
    })) {
      this.delete(key);
      return undefined;
    }

    // Refresh position for LRU eviction
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as unknown as R;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: T, ttlSeconds?: number, dependencies: readonly string[] = []): void {
    const effectiveTtl = ttlSeconds !== undefined ? ttlSeconds : this.defaultTtlSeconds;
    if (effectiveTtl <= 0) {
      return;
    }

    this.delete(key);
    const requiredKeys = [...new Set(dependencies)];
    const sizeBytes = estimateSizeBytes(key, value)
      + (requiredKeys.length > 0 ? Buffer.byteLength(JSON.stringify(requiredKeys)) : 0);
    if (sizeBytes > this.maxSizeBytes) {
      return;
    }

    if (this.store.size >= this.maxEntries || this.totalSizeBytes + sizeBytes > this.maxSizeBytes) {
      this.evictExpired();
    }
    while (
      this.store.size > 0 &&
      (this.store.size >= this.maxEntries || this.totalSizeBytes + sizeBytes > this.maxSizeBytes)
    ) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.delete(oldestKey);
    }

    this.store.set(key, {
      dependencies: requiredKeys,
      expiresAt: Date.now() + effectiveTtl * 1000,
      sizeBytes,
      value,
    });
    this.totalSizeBytes += sizeBytes;
  }

  get size(): number {
    return this.store.size;
  }

  get sizeBytes(): number {
    return this.totalSizeBytes;
  }
}
