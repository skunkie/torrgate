// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { ServerConfig } from '../types/config.js';
import { RequestSlotStore } from './limiter.js';

interface CacheEntry<T> {
  expiresAt: number;
  sizeBytes: number;
  value: T;
}

/**
 * Default memory budget for {@link MemoryCache}.
 */
export const DEFAULT_MEMORY_CACHE_BYTES = 64 * 1024 * 1024;

/**
 * Common cache storage interface supporting in-memory and persistent implementations.
 */
export interface CacheStore<T = unknown> {
  clear(): Promise<void> | void;
  delete(key: string): Promise<boolean> | boolean;
  get<R = T>(key: string): Promise<R | undefined> | R | undefined;
  set(key: string, value: T, ttlSeconds?: number): Promise<void> | void;
}

/**
 * Serializes cache-key fields without delimiter ambiguity.
 */
export function buildCacheKey(namespace: string, fields: readonly unknown[]): string {
  return `${namespace}:${JSON.stringify(fields)}`;
}

/**
 * Approximates the memory an entry holds by the size of its serialized form.
 */
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

  /**
   * Clears all cached entries.
   */
  clear(): void {
    this.store.clear();
    this.totalSizeBytes = 0;
  }

  /**
   * Removes a specific key from the cache.
   */
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

  /**
   * Retrieves a value from the cache if it exists and has not expired.
   */
  get<R = T>(key: string): R | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }

    // Refresh position for LRU eviction
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as unknown as R;
  }

  /**
   * Checks whether an unexpired key exists in the cache.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Stores a value in the cache with an optional TTL in seconds.
   */
  set(key: string, value: T, ttlSeconds?: number): void {
    const effectiveTtl = ttlSeconds !== undefined ? ttlSeconds : this.defaultTtlSeconds;
    if (effectiveTtl <= 0) {
      return;
    }

    this.delete(key);
    const sizeBytes = estimateSizeBytes(key, value);
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
      expiresAt: Date.now() + effectiveTtl * 1000,
      sizeBytes,
      value,
    });
    this.totalSizeBytes += sizeBytes;
  }

  /**
   * Returns the count of entries currently in the cache.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Approximate bytes held by cached entries.
   */
  get sizeBytes(): number {
    return this.totalSizeBytes;
  }
}

/**
 * Sets the key when absent and returns 0, or returns the key's remaining lifetime in
 * milliseconds (at least 1, so a claim expiring mid-script still reads as held).
 */
const CLAIM_SLOT_SCRIPT = `if redis.call('SET', KEYS[1], '1', 'NX', 'PX', ARGV[1]) then return 0 end
return math.max(redis.call('PTTL', KEYS[1]), 1)`;

/**
 * Persistent Redis cache provider using Upstash HTTP REST API.
 * Serverless-friendly with zero connection pool overhead.
 */
export class UpstashRedisCache<T = unknown> implements CacheStore<T>, RequestSlotStore {
  private readonly baseUrl: string;
  private readonly defaultTtlSeconds: number;
  private readonly token: string;

  constructor(url: string, token: string, defaultTtlSeconds = 300) {
    this.baseUrl = url.replace(/\/+$/, '');
    this.token = token;
    this.defaultTtlSeconds = defaultTtlSeconds;
  }

  /**
   * Clears all cached entries via FLUSHDB.
   */
  async clear(): Promise<void> {
    try {
      await this.sendCommand(['FLUSHDB']);
    } catch {
      // Safe no-throw on cache cleanup failure
    }
  }

  /**
   * Claims `key` for `ttlMs` with one atomic script, returning 0 on success, the milliseconds
   * left on a claim already held, or `undefined` when Redis cannot be reached.
   */
  async claimSlot(key: string, ttlMs: number): Promise<number | undefined> {
    try {
      const result = await this.sendCommand<number>(['EVAL', CLAIM_SLOT_SCRIPT, 1, key, Math.ceil(ttlMs)]);
      return typeof result === 'number' ? result : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Removes a specific key from the cache.
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.sendCommand<number>(['DEL', key]);
      return typeof result === 'number' && result > 0;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves a value from Upstash Redis if it exists and has not expired.
   */
  async get<R = T>(key: string): Promise<R | undefined> {
    try {
      const raw = await this.sendCommand<unknown>(['GET', key]);
      if (raw === null || raw === undefined) {
        return undefined;
      }

      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw) as R;
        } catch {
          return raw as unknown as R;
        }
      }

      return raw as R;
    } catch {
      return undefined;
    }
  }

  /**
   * Stores a value in Upstash Redis with TTL in seconds.
   */
  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const effectiveTtl = ttlSeconds !== undefined ? ttlSeconds : this.defaultTtlSeconds;
    if (effectiveTtl <= 0) {
      return;
    }

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.sendCommand(['SET', key, serialized, 'EX', Math.floor(effectiveTtl)]);
    } catch {
      // Safe no-throw on cache write failure
    }
  }

  /**
   * Internal helper executing a Redis command array against the Upstash REST endpoint.
   */
  private async sendCommand<R = unknown>(command: (number | string)[]): Promise<R | undefined> {
    const response = await fetch(this.baseUrl, {
      body: JSON.stringify(command),
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as { error?: string; result?: R };
    if (data.error) {
      return undefined;
    }

    return data.result;
  }
}

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
