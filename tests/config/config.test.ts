// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  findTrackerAccountVariables,
  getUnprotectedAccountWarning,
  loadConfig,
  parseProxyUrl,
  parseTrustProxy,
} from '../../src/config/config.js';

describe('Server Configuration Loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.API_KEY;
    delete process.env.CACHE_TTL_SECONDS;
    delete process.env.HOST;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.PORT;
    delete process.env.REQUEST_TIMEOUT_MS;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should load default configuration values when no env vars are set', () => {
    const config = loadConfig();
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.port, 8443);
    assert.equal(config.cacheTtlSeconds, 300);
    assert.equal(config.requestTimeoutMs, 10000);
    assert.equal(config.apiKey, undefined);
    assert.equal(config.kvRestApiToken, undefined);
    assert.equal(config.kvRestApiUrl, undefined);
    assert.equal(config.proxy, undefined);
  });

  it('should load KV_REST_API_URL and KV_REST_API_TOKEN from environment', () => {
    process.env.KV_REST_API_URL = 'https://example-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'sample-token';

    const config = loadConfig();
    assert.equal(config.kvRestApiUrl, 'https://example-kv.upstash.io');
    assert.equal(config.kvRestApiToken, 'sample-token');
  });

  it('should fallback to UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example-upstash.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'sample-upstash-token';

    const config = loadConfig();
    assert.equal(config.kvRestApiUrl, 'https://example-upstash.upstash.io');
    assert.equal(config.kvRestApiToken, 'sample-upstash-token');
  });

  it('should parse HTTPS_PROXY with credentials and port', () => {
    process.env.HTTPS_PROXY = 'http://proxyuser:proxypassword@127.0.0.1:8080';

    const config = loadConfig();
    assert.ok(config.proxy);
    assert.equal(config.proxy.host, '127.0.0.1');
    assert.equal(config.proxy.port, 8080);
    assert.equal(config.proxy.username, 'proxyuser');
    assert.equal(config.proxy.password, 'proxypassword');
    assert.equal(config.proxy.url, 'http://proxyuser:proxypassword@127.0.0.1:8080/');
  });

  it('should parse HTTP_PROXY when HTTPS_PROXY is not set', () => {
    process.env.HTTP_PROXY = 'http://127.0.0.1:8888';

    const config = loadConfig();
    assert.ok(config.proxy);
    assert.equal(config.proxy.host, '127.0.0.1');
    assert.equal(config.proxy.port, 8888);
    assert.equal(config.proxy.username, undefined);
    assert.equal(config.proxy.password, undefined);
  });

  it('should parse lowercase http_proxy when uppercase is not set', () => {
    process.env.http_proxy = 'http://10.0.0.1:3128';

    const config = loadConfig();
    assert.ok(config.proxy);
    assert.equal(config.proxy.host, '10.0.0.1');
    assert.equal(config.proxy.port, 3128);
  });

  it('should return undefined for empty or invalid proxy URLs in parseProxyUrl', () => {
    assert.equal(parseProxyUrl(''), undefined);
    assert.equal(parseProxyUrl('   '), undefined);
    assert.equal(parseProxyUrl(':::invalid:::'), undefined);
  });

  it('should reject proxy schemes the proxy agents do not support', () => {
    assert.equal(parseProxyUrl('socks5://127.0.0.1:1080'), undefined);
    assert.ok(parseProxyUrl('https://proxy.example.org:8443'));
  });

  it('should handle bare host:port without scheme in parseProxyUrl', () => {
    const parsed = parseProxyUrl('192.168.1.50:9050');
    assert.ok(parsed);
    assert.equal(parsed.host, '192.168.1.50');
    assert.equal(parsed.port, 9050);
  });
});

describe('parseTrustProxy', () => {
  it('should parse booleans, hop counts, and address lists', () => {
    assert.equal(parseTrustProxy('true', false), true);
    assert.equal(parseTrustProxy('false', true), false);
    assert.equal(parseTrustProxy('2', false), 2);
    assert.equal(parseTrustProxy('loopback, 10.0.0.0/8', false), 'loopback, 10.0.0.0/8');
  });

  it('should trust the platform proxy on Vercel only when nothing is configured', () => {
    assert.equal(parseTrustProxy(undefined, true), true);
    assert.equal(parseTrustProxy('', true), true);
    assert.equal(parseTrustProxy(undefined, false), undefined);
  });
});

describe('Unprotected tracker account warning', () => {
  const sampleEnv = {
    PORT: '8443',
    TORRGATE_SAMPLE_TRACKER_COOKIE: 'bb_session=sample',
    TORRGATE_SAMPLE_TRACKER_TIMEZONE: 'Europe/Moscow',
    TRACKER_PASSWORD: '',
  };

  it('should list only variables that configure an account', () => {
    assert.deepEqual(findTrackerAccountVariables(sampleEnv), ['TORRGATE_SAMPLE_TRACKER_COOKIE']);
  });

  it('should warn when accounts are configured without an API key', () => {
    const warning = getUnprotectedAccountWarning({ apiKey: undefined }, sampleEnv);
    assert.match(warning ?? '', /API_KEY is not set.*TORRGATE_SAMPLE_TRACKER_COOKIE/);
  });

  it('should stay quiet with an API key or without accounts', () => {
    assert.equal(getUnprotectedAccountWarning({ apiKey: 'sample-key' }, sampleEnv), undefined);
    assert.equal(getUnprotectedAccountWarning({ apiKey: undefined }, { PORT: '8443' }), undefined);
  });
});

