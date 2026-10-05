// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { RequestSlotStore } from '../http/request-throttle.js';
import { CacheStore } from './store.js';

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

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.sendCommand<number>(['DEL', key]);
      return typeof result === 'number' && result > 0;
    } catch {
      return false;
    }
  }

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
