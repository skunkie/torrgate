// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCacheKey, MemoryCache } from '../../src/utils/cache.js';

describe('buildCacheKey', () => {
  it('should distinguish fields containing the separator character', () => {
    const first = buildCacheKey('rss', ['search', 'sample:release']);
    const second = buildCacheKey('rss', ['search:sample', 'release']);

    assert.notEqual(first, second);
  });
});

describe('MemoryCache Utility', () => {
  it('should store and retrieve values within TTL', () => {
    const cache = new MemoryCache<string>(60);
    cache.set('sample-key', 'sample-value');

    assert.equal(cache.has('sample-key'), true);
    assert.equal(cache.get('sample-key'), 'sample-value');
    assert.equal(cache.size, 1);
  });

  it('should return undefined for non-existent keys', () => {
    const cache = new MemoryCache<string>(60);
    assert.equal(cache.get('non-existent'), undefined);
    assert.equal(cache.has('non-existent'), false);
  });

  it('should expire entries after TTL', async () => {
    const cache = new MemoryCache<string>(1); // 1 second
    cache.set('expiring-key', 'expiring-value', 0.05); // 50ms

    assert.equal(cache.get('expiring-key'), 'expiring-value');

    await new Promise(resolve => setTimeout(resolve, 70));

    assert.equal(cache.get('expiring-key'), undefined);
    assert.equal(cache.has('expiring-key'), false);
  });

  it('should evict oldest entry when capacity is exceeded', () => {
    const cache = new MemoryCache<string>(60, 2); // max 2 entries
    cache.set('first', 'val1');
    cache.set('second', 'val2');
    cache.set('third', 'val3');

    assert.equal(cache.size, 2);
    assert.equal(cache.get('first'), undefined);
    assert.equal(cache.get('second'), 'val2');
    assert.equal(cache.get('third'), 'val3');
  });

  it('should refresh LRU order on access', () => {
    const cache = new MemoryCache<string>(60, 2);
    cache.set('first', 'val1');
    cache.set('second', 'val2');

    // Access 'first' to make 'second' the oldest
    assert.equal(cache.get('first'), 'val1');

    // Adding 'third' should evict 'second', not 'first'
    cache.set('third', 'val3');

    assert.equal(cache.get('first'), 'val1');
    assert.equal(cache.get('second'), undefined);
    assert.equal(cache.get('third'), 'val3');
  });

  it('should delete and clear entries properly', () => {
    const cache = new MemoryCache<string>(60);
    cache.set('k1', 'v1');
    cache.set('k2', 'v2');

    assert.equal(cache.delete('k1'), true);
    assert.equal(cache.get('k1'), undefined);
    assert.equal(cache.size, 1);

    cache.clear();
    assert.equal(cache.size, 0);
  });

  it('should not store entries when TTL is zero or negative', () => {
    const cache = new MemoryCache<string>(0);
    cache.set('key', 'val');
    assert.equal(cache.get('key'), undefined);
    assert.equal(cache.size, 0);
  });

  it('should explicitly evict expired entries via evictExpired', async () => {
    const cache = new MemoryCache<string>(60);
    cache.set('permanent', 'value1', 60);
    cache.set('temporary', 'value2', 0.05);

    await new Promise(resolve => setTimeout(resolve, 70));

    const count = cache.evictExpired();
    assert.equal(count, 1);
    assert.equal(cache.has('permanent'), true);
    assert.equal(cache.has('temporary'), false);
  });

  it('should prefer evicting expired entries when reaching capacity', async () => {
    const cache = new MemoryCache<string>(60, 2);
    cache.set('first', 'val1', 60);
    cache.set('second-expired', 'val2', 0.05);

    await new Promise(resolve => setTimeout(resolve, 70));

    // Adding 'third' should evict 'second-expired' instead of 'first'
    cache.set('third', 'val3', 60);

    assert.equal(cache.has('first'), true);
    assert.equal(cache.has('third'), true);
    assert.equal(cache.has('second-expired'), false);
    assert.equal(cache.size, 2);
  });

  it('should periodically evict expired entries when cleanup interval is configured', async () => {
    // 0.05s TTL, 0.05s cleanup interval
    const cache = new MemoryCache<string>(60, 100, 0.05);
    try {
      cache.set('expiring', 'value', 0.03);
      assert.equal(cache.size, 1);

      await new Promise(resolve => setTimeout(resolve, 90));

      assert.equal(cache.size, 0);
    } finally {
      cache.destroy();
    }
  });

  it('should clean up resources and clear entries on destroy', () => {
    const cache = new MemoryCache<string>(60, 100, 1);
    cache.set('key', 'value');
    assert.equal(cache.size, 1);
    cache.destroy();
    assert.equal(cache.size, 0);
  });
});

describe('MemoryCache size budget', () => {
  it('should evict least recently used entries to stay within the byte budget', () => {
    const cache = new MemoryCache<string>(300, 100, 0, 250);
    cache.set('first', 'a'.repeat(100));
    cache.set('second', 'b'.repeat(100));
    cache.get('first');
    cache.set('third', 'c'.repeat(100));

    assert.equal(cache.has('first'), true);
    assert.equal(cache.has('second'), false);
    assert.equal(cache.has('third'), true);
    assert.ok(cache.sizeBytes <= 250);
  });

  it('should not store a value larger than the whole budget', () => {
    const cache = new MemoryCache<string>(300, 100, 0, 50);
    cache.set('small', 'sample');
    cache.set('oversized', 'x'.repeat(100));

    assert.equal(cache.has('oversized'), false);
    assert.equal(cache.has('small'), true);
  });

  it('should release the size of deleted and replaced entries', () => {
    const cache = new MemoryCache<string>(300, 100, 0, 1000);
    cache.set('key', 'a'.repeat(100));
    cache.set('key', 'b'.repeat(10));
    assert.equal(cache.sizeBytes, Buffer.byteLength('key') + 10);
    cache.delete('key');
    assert.equal(cache.sizeBytes, 0);
  });
});
