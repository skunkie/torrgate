// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { createSessionToken, SESSION_COOKIE_NAME } from '../../src/api/middleware/auth.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';

describe('Failed API key throttling', () => {
  const sampleApiKey = 'sample-throttle-key';
  let baseUrl: string;
  let testServer: http.Server;

  before(async () => {
    const registry = new ProviderRegistry(new HttpClient());
    const app = createApp(registry, { apiKey: sampleApiKey, trustProxy: true });
    await new Promise<void>(resolve => {
      testServer = app.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => {
      testServer.close(() => resolve());
    });
  });

  const requestIndexers = (clientAddress: string, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/api/v2.0/indexers`, {
      headers: { 'X-Forwarded-For': clientAddress, ...headers },
    });

  const sendWrongKeys = async (clientAddress: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const res = await requestIndexers(clientAddress, { 'X-Api-Key': 'wrong-sample-key' });
      assert.equal(res.status, 401);
    }
  };

  it('should answer 429 on API routes after repeated wrong keys, even for the right key', async () => {
    await sendWrongKeys('198.51.100.10', 5);

    const blocked = await requestIndexers('198.51.100.10', { 'X-Api-Key': 'wrong-sample-key' });
    assert.equal(blocked.status, 429);
    const correctWhileBlocked = await requestIndexers('198.51.100.10', { 'X-Api-Key': sampleApiKey });
    assert.equal(correctWhileBlocked.status, 429);
  });

  it('should still accept a valid session cookie from a blocked client', async () => {
    await sendWrongKeys('198.51.100.11', 5);

    const cookie = `${SESSION_COOKIE_NAME}=${createSessionToken(sampleApiKey)}`;
    const res = await requestIndexers('198.51.100.11', { Cookie: cookie });
    assert.equal(res.status, 200);
  });

  it('should count wrong keys on API routes toward the sign-in form limit', async () => {
    await sendWrongKeys('198.51.100.12', 5);

    const res = await fetch(`${baseUrl}/login`, {
      body: new URLSearchParams({ apiKey: sampleApiKey, returnUrl: '/' }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-For': '198.51.100.12',
      },
      method: 'POST',
      redirect: 'manual',
    });
    assert.equal(res.status, 429);
  });

  it('should answer Torznab URLs with Torznab error documents', async () => {
    const unauthorized = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=caps&apikey=wrong-sample-key`, {
      headers: { 'X-Forwarded-For': '198.51.100.14' },
    });
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get('content-type') || '', /application\/xml/);
    assert.match(await unauthorized.text(), /<error code="100" description="Invalid or missing API key" \/>/);

    await sendWrongKeys('198.51.100.14', 4);
    const blocked = await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab?t=search&apikey=wrong-sample-key`, {
      headers: { 'X-Forwarded-For': '198.51.100.14' },
    });
    assert.equal(blocked.status, 429);
    assert.match(await blocked.text(), /<error code="500" /);
  });

  it('should track clients behind a trusted proxy separately', async () => {
    await sendWrongKeys('198.51.100.13', 5);

    const otherClient = await requestIndexers('203.0.113.13', { 'X-Api-Key': sampleApiKey });
    assert.equal(otherClient.status, 200);
  });
});
