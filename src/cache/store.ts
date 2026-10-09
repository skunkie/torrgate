// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

/**
 * Common cache storage interface supporting in-memory and persistent implementations.
 */
export interface CacheStore<T = unknown> {
  clear(): Promise<void> | void;
  delete(key: string): Promise<boolean> | boolean;
  get<R = T>(key: string): Promise<R | undefined> | R | undefined;
  /** A value is returned only while all dependency keys exist and have not expired. */
  set(key: string, value: T, ttlSeconds?: number, dependencies?: readonly string[]): Promise<void> | void;
}

/**
 * Serializes cache-key fields without delimiter ambiguity.
 */
export function buildCacheKey(namespace: string, fields: readonly unknown[]): string {
  return `${namespace}:${JSON.stringify(fields)}`;
}
