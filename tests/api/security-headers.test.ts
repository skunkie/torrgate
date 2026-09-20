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

describe('Security headers and parameter handling', () => {
  const sampleApiKey = 'sample-headers-key';
  let baseUrl: string;
  let httpClient: HttpClient;
  let testServer: http.Server;
  const sessionCookie = (): string => `${SESSION_COOKIE_NAME}=${createSessionToken(sampleApiKey)}`;

  before(async () => {
    httpClient = new HttpClient();
    const app = createApp(new ProviderRegistry(httpClient), sampleApiKey);
    await new Promise<void>(resolve => {
      testServer = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(testServer.address() as { port: number }).port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  it('should send hardening headers on every response and hide the framework', async () => {
    for (const path of ['/login', '/api/v2.0/indexers', '/missing-sample-path']) {
      const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', path);
      assert.equal(res.headers.get('x-powered-by'), null, path);
    }
  });

  it('should forbid framing and load sign-in styles from the same origin', async () => {
    const res = await fetch(`${baseUrl}/login`);
    const policy = res.headers.get('content-security-policy') || '';
    assert.match(policy, /default-src 'none'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /form-action 'self'/);
    assert.match(policy, /script-src 'self';/);
    assert.match(policy, /style-src 'self';/);
    assert.ok(!policy.includes("script-src 'unsafe-inline'"));
    assert.ok(!policy.includes("style-src 'unsafe-inline'"));

    const styles = await fetch(`${baseUrl}/login.css`);
    assert.equal(styles.status, 200);
    assert.match(styles.headers.get('content-type') || '', /text\/css/);
    assert.equal(styles.headers.get('cache-control'), 'no-cache');
    const css = await styles.text();
    assert.match(css, /--accent: #10b981;/);
    assert.match(css, /:root\[data-theme='light'\] \{[\s\S]*?--surface: #ffffff;/);
    assert.match(css, /\.brand-logo \{[\s\S]*?color: var\(--accent\);/);
    assert.match(css, /input\[type=password\]:focus \{[\s\S]*?border-color: var\(--accent\);/);

    const script = await fetch(`${baseUrl}/theme.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') || '', /application\/javascript/);
    assert.equal(script.headers.get('cache-control'), 'no-cache');
    assert.match(await script.text(), /torrgate_theme/);
  });

  it('should forbid framing of the web client and the docs', async () => {
    for (const path of ['/', '/docs']) {
      const res = await fetch(`${baseUrl}${path}`, { headers: { Cookie: sessionCookie() } });
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/, path);
    }
  });

  it('should load the web client assets without allowing inline scripts or styles', async () => {
    const res = await fetch(`${baseUrl}/`, { headers: { Cookie: sessionCookie() } });
    const policy = res.headers.get('content-security-policy') || '';
    assert.match(policy, /script-src 'self';/);
    assert.match(policy, /style-src 'self';/);
    assert.match(policy, /font-src 'self' data:;/);
    assert.ok(!policy.includes("script-src 'self' 'unsafe-inline'"));
    assert.ok(!policy.includes("style-src 'self' 'unsafe-inline'"));
  });

  it('should load a pinned API reference script with Subresource Integrity and no outbound connections', async () => {
    const res = await fetch(`${baseUrl}/docs`, { headers: { Cookie: sessionCookie() } });
    const html = await res.text();
    assert.match(html, /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@\d+\.\d+\.\d+\/[^"]+" integrity="sha384-[A-Za-z0-9+/=]+" crossorigin="anonymous"><\/script>/);
    assert.match(res.headers.get('content-security-policy') || '', /connect-src 'self';/);
  });

  it('should render the sign-in page when returnUrl is repeated', async () => {
    const res = await fetch(`${baseUrl}/login?returnUrl=/&returnUrl=/docs`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /name="returnUrl" value="\/"/);
  });

  it('should use the first value when a download url parameter is repeated', async () => {
    const requestedUrls: string[] = [];
    httpClient.getBinary = async (url: string) => {
      requestedUrls.push(url);
      return { data: Buffer.from('d8:announce31:http://retracker.local/announcee'), headers: {} };
    };

    const first = encodeURIComponent('https://rutor.info/download/1');
    const second = encodeURIComponent('https://rutor.info/download/2');
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/download?url=${first}&url=${second}`, {
      headers: { 'X-Api-Key': sampleApiKey },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(requestedUrls, ['https://rutor.info/download/1']);
  });
});
