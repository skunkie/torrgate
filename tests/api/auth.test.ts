// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import {
  createSessionToken,
  parseCookieHeader,
  SESSION_COOKIE_NAME,
  timingSafeCompare,
} from '../../src/api/middleware/auth.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { ApiErrorResponse } from '../../src/types/api.js';

describe('API Key Authentication Middleware', () => {
  const sampleApiKey = 'test-secret-api-key-123';
  let securedBaseUrl: string;
  let securedServer: http.Server;
  let unsecureBaseUrl: string;
  let unsecureServer: http.Server;

  before(async () => {
    const httpClient = new HttpClient();
    httpClient.getBinary = async () => ({ data: Buffer.from('d8:announce31:http://retracker.local/announcee'), headers: {} });
    const registry = new ProviderRegistry(httpClient);

    for (const provider of registry.getAllProviders()) {
      provider.searchByTitle = async () => [
        {
          category: 'Video',
          categoryId: 7,
          date: '2024-08-15',
          downloadCount: 10,
          id: '12345',
          leechers: 5,
          magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
          name: 'Пример Релиза / Sample Release',
          seeders: 42,
          size: '1.5 GB',
          sizeBytes: 1610612736,
          torrentUrl: 'https://rutor.info/download/12345',
          url: 'https://rutor.info/details/12345',
        },
      ];
      provider.searchPageByTitle = undefined;
    }

    const securedApp = createApp(registry, sampleApiKey);
    await new Promise<void>(resolve => {
      securedServer = securedApp.listen(0, '127.0.0.1', () => {
        const addr = securedServer.address() as { port: number };
        securedBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const unsecureApp = createApp(registry);
    await new Promise<void>(resolve => {
      unsecureServer = unsecureApp.listen(0, '127.0.0.1', () => {
        const addr = unsecureServer.address() as { port: number };
        unsecureBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await Promise.all([
      new Promise<void>(resolve => {
        securedServer.close(() => resolve());
      }),
      new Promise<void>(resolve => {
        unsecureServer.close(() => resolve());
      }),
    ]);
  });

  describe('When API key is configured', () => {
    it('should reject requests with missing API key with 401', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers`);
      assert.equal(res.status, 401);
      const body = (await res.json()) as ApiErrorResponse;
      assert.equal(body.error, 'Unauthorized');
      assert.equal(body.statusCode, 401);
      assert.equal(body.success, false);
    });

    it('should reject requests with invalid API key query param with 401', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers?apikey=wrong-key`);
      assert.equal(res.status, 401);
    });

    it('should reject requests with invalid X-Api-Key header with 401', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers`, {
        headers: { 'X-Api-Key': 'wrong-key' },
      });
      assert.equal(res.status, 401);
    });

    it('should allow requests with valid apikey query param', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers?apikey=${sampleApiKey}`);
      assert.equal(res.status, 200);
    });

    it('should allow requests with valid api_key query param', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers?api_key=${sampleApiKey}`);
      assert.equal(res.status, 200);
    });

    it('should allow requests with valid passkey query param', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers?passkey=${sampleApiKey}`);
      assert.equal(res.status, 200);
    });

    it('should allow requests with valid jackett_apikey query param', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers?jackett_apikey=${sampleApiKey}`);
      assert.equal(res.status, 200);
    });

    it('should allow requests with valid X-Api-Key header', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers`, {
        headers: { 'X-Api-Key': sampleApiKey },
      });
      assert.equal(res.status, 200);
    });

    it('should allow requests with valid session cookie', async () => {
      const token = createSessionToken(sampleApiKey);
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      assert.equal(res.status, 200);
    });

    it('should allow API requests with Authorization: Bearer header', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers`, {
        headers: { Authorization: `Bearer ${sampleApiKey}` },
      });
      assert.equal(res.status, 200);
    });

    it('should handle malformed cookie strings gracefully without crashing', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers`, {
        headers: {
          Authorization: `Bearer ${sampleApiKey}`,
          Cookie: 'malformed=%E0%A4%95%; good=value',
        },
      });
      assert.equal(res.status, 200);
    });

    it('GET /docs without authentication should render login page with 401 status', async () => {
      const res = await fetch(`${securedBaseUrl}/docs`);
      assert.equal(res.status, 401);
      const html = await res.text();
      assert.ok(html.includes('TorrGate'));
      assert.ok(html.includes('Sign in'));
      assert.ok(html.includes('action="/login"'));
    });

    it('GET /docs with valid session cookie should display Scalar documentation and Sign out button', async () => {
      const token = createSessionToken(sampleApiKey);
      const res = await fetch(`${securedBaseUrl}/docs`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('TorrGate API Reference'));
      assert.ok(html.includes('Sign out'));
      assert.ok(html.includes('href="/logout"'));
      assert.equal(html.includes(sampleApiKey), false);
    });

    it('GET /api/v2.0/indexers/openapi.yaml without credentials should return 401 Unauthorized', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers/openapi.yaml`);
      assert.equal(res.status, 401);
      const body = (await res.json()) as { error: string; statusCode: number };
      assert.equal(body.error, 'Unauthorized');
      assert.equal(body.statusCode, 401);
    });

    it('GET /api/v2.0/indexers/openapi.yaml should succeed with session cookie, X-Api-Key, ?apikey=, or Bearer', async () => {
      const token = createSessionToken(sampleApiKey);

      const cookieRes = await fetch(`${securedBaseUrl}/api/v2.0/indexers/openapi.yaml`, {
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      assert.equal(cookieRes.status, 200);
      assert.ok((await cookieRes.text()).includes('openapi: 3.1.0'));

      const headerRes = await fetch(`${securedBaseUrl}/api/v2.0/indexers/openapi.yaml`, {
        headers: { 'X-Api-Key': sampleApiKey },
      });
      assert.equal(headerRes.status, 200);
      assert.ok((await headerRes.text()).includes('openapi: 3.1.0'));

      const queryRes = await fetch(`${securedBaseUrl}/api/v2.0/indexers/openapi.yaml?apikey=${sampleApiKey}`);
      assert.equal(queryRes.status, 200);
      assert.ok((await queryRes.text()).includes('openapi: 3.1.0'));

      const bearerRes = await fetch(`${securedBaseUrl}/api/v2.0/indexers/openapi.yaml`, {
        headers: { Authorization: `Bearer ${sampleApiKey}` },
      });
      assert.equal(bearerRes.status, 200);
      assert.ok((await bearerRes.text()).includes('openapi: 3.1.0'));
    });

    it('POST /login with valid key and returnUrl should redirect and issue session cookie', async () => {
      const formData = new URLSearchParams({ apiKey: sampleApiKey, returnUrl: '/docs' });
      const res = await fetch(`${securedBaseUrl}/login`, {
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/docs');

      const setCookie = res.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes(`${SESSION_COOKIE_NAME}=`));
      assert.ok(setCookie.includes('HttpOnly'));
      assert.ok(setCookie.includes('SameSite=Lax'));
    });

    it('POST /login with invalid key should return 401 without cookie', async () => {
      const formData = new URLSearchParams({ apiKey: 'wrong-key', returnUrl: '/docs' });
      const res = await fetch(`${securedBaseUrl}/login`, {
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      });
      assert.equal(res.status, 401);
      const html = await res.text();
      assert.ok(html.includes('Invalid API key'));
      assert.ok(!res.headers.get('set-cookie')?.includes(`${SESSION_COOKIE_NAME}=`));
    });

    it('POST /login should reject open-redirect return URLs', async () => {
      const formData = new URLSearchParams({
        apiKey: sampleApiKey,
        returnUrl: '/\\evil.example/path',
      });
      const res = await fetch(`${securedBaseUrl}/login`, {
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/');
    });

    it('ALL /logout should clear session cookie and redirect to /login', async () => {
      const res = await fetch(`${securedBaseUrl}/logout`, { redirect: 'manual' });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/login');
      const setCookie = res.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes('Max-Age=0'));
    });

    it('should include jackett_apikey in JSON search result Link and allow unauthenticated download via that link', async () => {
      const searchRes = await fetch(`${securedBaseUrl}/api/v2.0/indexers/rutor/results?Query=sample&apikey=${sampleApiKey}`);
      assert.equal(searchRes.status, 200);
      const searchData = (await searchRes.json()) as { Results: { Link: string }[] };
      assert.ok(searchData.Results.length > 0);
      const link = searchData.Results[0]?.Link;
      assert.ok(link);
      assert.ok(link.includes(`jackett_apikey=${encodeURIComponent(sampleApiKey)}`));

      const downloadRes = await fetch(link);
      assert.equal(downloadRes.status, 200);
      const fileData = await downloadRes.arrayBuffer();
      assert.equal(Buffer.from(fileData).toString('utf-8'), 'd8:announce31:http://retracker.local/announcee');
    });

    it('should include jackett_apikey in Torznab RSS enclosure and link elements', async () => {
      const res = await fetch(`${securedBaseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=sample&apikey=${sampleApiKey}`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes(`jackett_apikey=${encodeURIComponent(sampleApiKey)}`));
    });

    it('POST /login should rate limit after multiple consecutive failed attempts', async () => {
      const formData = new URLSearchParams({ apiKey: 'wrong-key-attempt', returnUrl: '/' });
      for (let i = 0; i < 5; i++) {
        await fetch(`${securedBaseUrl}/login`, {
          body: formData.toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          method: 'POST',
        });
      }

      const res = await fetch(`${securedBaseUrl}/login`, {
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      });
      assert.equal(res.status, 429);
      const text = await res.text();
      assert.match(text, /Too many login attempts/);
    });
  });

  describe('When API key is not configured', () => {
    it('should allow unauthenticated access to indexer endpoints', async () => {
      const res = await fetch(`${unsecureBaseUrl}/api/v2.0/indexers`);
      assert.equal(res.status, 200);
    });

    it('should allow public access to docs and openapi.yaml without API key', async () => {
      const resDocs = await fetch(`${unsecureBaseUrl}/docs`);
      assert.equal(resDocs.status, 200);

      const resSpec = await fetch(`${unsecureBaseUrl}/api/v2.0/indexers/openapi.yaml`);
      assert.equal(resSpec.status, 200);
    });

    it('should not append jackett_apikey to Link or Torznab RSS when no API key is configured or provided', async () => {
      const searchRes = await fetch(`${unsecureBaseUrl}/api/v2.0/indexers/rutor/results?Query=sample`);
      assert.equal(searchRes.status, 200);
      const searchData = (await searchRes.json()) as { Results: { Link: string }[] };
      const link = searchData.Results[0]?.Link;
      assert.ok(link);
      assert.ok(!link.includes('jackett_apikey'));

      const torznabRes = await fetch(`${unsecureBaseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=sample`);
      assert.equal(torznabRes.status, 200);
      const text = await torznabRes.text();
      assert.ok(!text.includes('jackett_apikey'));
    });
  });

  describe('timingSafeCompare', () => {
    it('should return true for identical strings', () => {
      assert.equal(timingSafeCompare('secret-token', 'secret-token'), true);
      assert.equal(timingSafeCompare('', ''), true);
    });

    it('should return false for different strings', () => {
      assert.equal(timingSafeCompare('secret-token-a', 'secret-token-b'), false);
    });

    it('should return false for strings with different lengths without throwing', () => {
      assert.equal(timingSafeCompare('short', 'much-longer-string'), false);
    });

    it('should return false safely when either value is undefined', () => {
      assert.equal(timingSafeCompare(undefined, 'secret'), false);
      assert.equal(timingSafeCompare('secret', undefined), false);
      assert.equal(timingSafeCompare(undefined, undefined), false);
    });
  });

  describe('parseCookieHeader', () => {
    it('should safely parse valid cookie strings', () => {
      const parsed = parseCookieHeader('foo=bar; baz=qux');
      assert.equal(parsed.foo, 'bar');
      assert.equal(parsed.baz, 'qux');
    });

    it('should ignore malformed URI encoding without throwing an unhandled exception', () => {
      const parsed = parseCookieHeader('bad=%E0%A4%95%; valid=hello');
      assert.equal(parsed.valid, 'hello');
      assert.equal(parsed.bad, undefined);
    });
  });
});
