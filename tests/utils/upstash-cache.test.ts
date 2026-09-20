// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ServerConfig } from '../../src/types/config.js';
import { createCacheFromConfig, MemoryCache, UpstashRedisCache } from '../../src/utils/cache.js';

describe('Upstash Redis Cache Provider', () => {
  let lastCommand: unknown = null;
  let lastHeaders: http.IncomingHttpHeaders | null = null;
  let testResponseStatus = 200;
  let testResponseBody: unknown = { result: 'OK' };
  let testServer: http.Server;
  let serverUrl = '';

  before(async () => {
    testServer = http.createServer((req, res) => {
      lastHeaders = req.headers;
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          lastCommand = JSON.parse(body);
        } catch {
          lastCommand = body;
        }
        res.writeHead(testResponseStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(testResponseBody));
      });
    });

    await new Promise<void>(resolve => {
      testServer.listen(0, '127.0.0.1', () => {
        const address = testServer.address();
        if (address && typeof address === 'object') {
          serverUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  beforeEach(() => {
    lastCommand = null;
    lastHeaders = null;
    testResponseStatus = 200;
    testResponseBody = { result: 'OK' };
  });

  it('should store values using SET command with EX ttl and Authorization header', async () => {
    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token', 600);
    const samplePayload = { id: 42, title: 'Sample Release Item' };

    await cache.set('sample:key:1', samplePayload, 120);

    assert.equal(lastHeaders?.authorization, 'Bearer test-secret-token');
    assert.deepEqual(lastCommand, [
      'SET',
      'sample:key:1',
      JSON.stringify(samplePayload),
      'EX',
      120,
    ]);
  });

  it('should claim a request slot with one atomic script and report the wait on a held claim', async () => {
    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');

    testResponseBody = { result: 0 };
    assert.equal(await cache.claimSlot('request-slot:sample', 2000), 0);
    assert.ok(Array.isArray(lastCommand));
    const [command, script, keyCount, key, ttlMs] = lastCommand as unknown[];
    assert.deepEqual([command, keyCount, key, ttlMs], ['EVAL', 1, 'request-slot:sample', 2000]);
    assert.match(String(script), /'SET', KEYS\[1\], '1', 'NX', 'PX', ARGV\[1\]/);

    testResponseBody = { result: 1234 };
    assert.equal(await cache.claimSlot('request-slot:sample', 2000), 1234);
  });

  it('should report an unreachable store when a slot claim fails', async () => {
    testResponseStatus = 503;
    testResponseBody = { error: 'Sample outage' };
    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');

    assert.equal(await cache.claimSlot('request-slot:sample', 2000), undefined);
    assert.equal(await new UpstashRedisCache('http://127.0.0.1:1', 'test-secret-token').claimSlot('request-slot:sample', 2000), undefined);
  });

  it('should retrieve and parse cached JSON objects', async () => {
    const samplePayload = { id: 42, title: 'Sample Release Item' };
    testResponseBody = { result: JSON.stringify(samplePayload) };

    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');
    const result = await cache.get<typeof samplePayload>('sample:key:1');

    assert.deepEqual(lastCommand, ['GET', 'sample:key:1']);
    assert.deepEqual(result, samplePayload);
  });

  it('should return undefined when key does not exist or result is null', async () => {
    testResponseBody = { result: null };

    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');
    const result = await cache.get('missing:key');

    assert.equal(result, undefined);
  });

  it('should return raw string if cached value is not valid JSON', async () => {
    testResponseBody = { result: 'plain text release info' };

    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');
    const result = await cache.get<string>('sample:text');

    assert.equal(result, 'plain text release info');
  });

  it('should return undefined without throwing when upstream returns error status', async () => {
    testResponseStatus = 429;
    testResponseBody = { error: 'Daily request quota exceeded' };

    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');
    const result = await cache.get('sample:key');

    assert.equal(result, undefined);
  });

  it('should not throw on set when upstream returns error status', async () => {
    testResponseStatus = 500;
    testResponseBody = { error: 'Internal Server Error' };

    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');
    await assert.doesNotReject(async () => {
      await cache.set('sample:key', { foo: 'bar' });
    });
  });

  it('should not perform set if TTL is zero or negative', async () => {
    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');
    await cache.set('sample:key', 'value', 0);
    assert.equal(lastCommand, null);

    await cache.set('sample:key', 'value', -10);
    assert.equal(lastCommand, null);
  });

  it('should delete a key and return boolean result', async () => {
    testResponseBody = { result: 1 };

    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');
    const deleted = await cache.delete('sample:key');

    assert.deepEqual(lastCommand, ['DEL', 'sample:key']);
    assert.equal(deleted, true);
  });

  it('should clear all keys using FLUSHDB command', async () => {
    testResponseBody = { result: 'OK' };

    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');
    await cache.clear();

    assert.deepEqual(lastCommand, ['FLUSHDB']);
  });

  it('should safely return false from delete on server error', async () => {
    testResponseStatus = 500;

    const cache = new UpstashRedisCache(serverUrl, 'test-secret-token');
    const deleted = await cache.delete('sample:key');

    assert.equal(deleted, false);
  });

  it('should safely handle unreachable endpoint without throwing', async () => {
    const brokenCache = new UpstashRedisCache('http://127.0.0.1:9', 'token');

    const result = await brokenCache.get('sample:key');
    assert.equal(result, undefined);

    await assert.doesNotReject(async () => {
      await brokenCache.set('sample:key', 'value');
      await brokenCache.delete('sample:key');
      await brokenCache.clear();
    });
  });
});

describe('createCacheFromConfig Factory', () => {
  it('should create UpstashRedisCache when KV credentials are provided', () => {
    const config: ServerConfig = {
      cacheTtlSeconds: 300,
      host: '0.0.0.0',
      kvRestApiToken: 'sample-token',
      kvRestApiUrl: 'https://sample.upstash.io',
      port: 8443,
      requestTimeoutMs: 10000,
    };

    const cache = createCacheFromConfig(config);
    assert.ok(cache instanceof UpstashRedisCache);
  });

  it('should create MemoryCache when KV credentials are absent and TTL > 0', () => {
    const config: ServerConfig = {
      cacheTtlSeconds: 300,
      host: '0.0.0.0',
      port: 8443,
      requestTimeoutMs: 10000,
    };

    const cache = createCacheFromConfig(config);
    assert.ok(cache instanceof MemoryCache);
  });

  it('should return undefined when cacheTtlSeconds is 0 and no KV credentials', () => {
    const config: ServerConfig = {
      cacheTtlSeconds: 0,
      host: '0.0.0.0',
      port: 8443,
      requestTimeoutMs: 10000,
    };

    const cache = createCacheFromConfig(config);
    assert.equal(cache, undefined);
  });
});
