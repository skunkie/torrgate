// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { THEME_SCRIPT } from '../../src/api/views/theme-script.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';

describe('TorrGate Web Client & Authentication', () => {
  describe('Public Mode (no apiKey)', () => {
    let baseUrl: string;
    let server: http.Server;

    before(async () => {
      const httpClient = new HttpClient();
      const registry = new ProviderRegistry(httpClient);
      const app = createApp(registry);

      server = http.createServer(app);
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    after(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
    });

    it('GET / should render the web client application HTML with 200 status', async () => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /text\/html/);
      assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'/);

      const html = await res.text();
      assert.match(html, /TorrGate/);
      assert.match(html, /id="query-input"/);
      assert.match(html, /id="indexer-select"/);
      assert.match(html, /id="category-pills"/);
      assert.match(html, /id="results-list"/);
      assert.match(html, /id="modal-trackers"/);
      assert.match(html, /id="modal-integration"/);
      assert.match(html, /id="tracker-summary-count"/);
      assert.match(html, /id="btn-toggle-all"/);
      assert.match(html, /id="btn-disable-offline"/);
      assert.match(html, /id="modal-shortcuts"/);
      assert.match(html, /id="btn-open-shortcuts"/);
      assert.match(html, /id="theme-toggle"/);
      assert.match(html, /<meta name="theme-color" id="theme-color" content="#0f0f0f">/);
      assert.match(html, /<script src="\/theme\.js"><\/script>/);
      assert.match(html, /<link rel="stylesheet" href="\/web-client\.css">/);
      assert.match(html, /<script src="\/web-client\.js" defer><\/script>/);
      assert.ok(!html.includes('<style>'));
      assert.ok(!html.includes('<script>'));
      assert.ok(!html.includes('onclick='));
      assert.ok(!html.includes('Sign Out'));

      const styles = await (await fetch(`${baseUrl}/web-client.css`)).text();
      assert.match(styles, /\.status-dot\.untested/);

      const script = await (await fetch(`${baseUrl}/web-client.js`)).text();
      assert.match(script, /e\.key === 'Escape'/);
      assert.match(script, /highlightResult/);
      assert.match(script, /btn-copy-magnet/);
      assert.match(script, /btn-fetch-magnet/);
      assert.match(script, /function getMagnetEndpoint\(/);
      assert.match(script, /btn-view-details/);
      assert.match(script, /function isSafeUrl\(/);
      assert.match(script, /tracker-switch/);
    });

    it('GET / should include a tracker failure notice filled with text nodes, not HTML', async () => {
      const html = await (await fetch(`${baseUrl}/`)).text();
      assert.match(html, /id="indexer-warnings" role="status" hidden/);

      const script = await (await fetch(`${baseUrl}/web-client.js`)).text();
      assert.match(script, /renderIndexerWarnings\(data\.Indexers \|\| \[\]\)/);
      assert.match(script, /name\.textContent = idx\.Name \|\| idx\.ID;/);
      assert.ok(!/indexerWarnings\.innerHTML/.test(script));
    });

    it('GET /web-client assets should serve same-origin CSS and JavaScript', async () => {
      const styles = await fetch(`${baseUrl}/web-client.css`);
      assert.equal(styles.status, 200);
      assert.match(styles.headers.get('content-type') || '', /text\/css/);
      assert.equal(styles.headers.get('cache-control'), 'no-cache');
      const styleText = await styles.text();
      assert.match(styleText, /--section-gap: 24px;/);
      assert.match(styleText, /--font-sans: Inter, ui-sans-serif, system-ui/);
      assert.match(styleText, /--button-bg: #ffffff;/);
      assert.match(styleText, /:root\[data-theme='light'\] \{[\s\S]*?--bg: #f4f4f5;/);
      assert.match(styleText, /:root\[data-theme='light'\] \{[\s\S]*?--button-bg: #18181b;/);
      assert.match(styleText, /\.brand-logo \{[\s\S]*?color: var\(--accent\);/);
      assert.match(styleText, /\.btn-search \{[\s\S]*?background: var\(--button-bg\);/);
      assert.match(styleText, /\.nav-btn span:not\(#theme-toggle-icon\) \{[\s\S]*?display: none;/);
      assert.match(styleText, /@media \(max-width: 480px\) \{[\s\S]*?\.header-inner \{[\s\S]*?flex-wrap: wrap;/);
      assert.match(styleText, /@media \(max-width: 480px\) \{[\s\S]*?\.header-right \{[\s\S]*?flex-wrap: wrap;/);

      const script = await fetch(`${baseUrl}/web-client.js`);
      assert.equal(script.status, 200);
      assert.match(script.headers.get('content-type') || '', /application\/javascript/);
      assert.equal(script.headers.get('cache-control'), 'no-cache');
      const scriptText = await script.text();
      assert.match(scriptText, /function performSearch\(\)/);
      assert.ok(!scriptText.includes('onclick='));
    });

    it('GET / should render the navbar with the shared section card styling', async () => {
      const css = await (await fetch(`${baseUrl}/web-client.css`)).text();
      assert.match(css, /\.header-inner \{[\s\S]*?background: var\(--surface\);/);
      assert.match(css, /\.header-inner \{[\s\S]*?border: 1px solid var\(--border\);/);
      assert.match(css, /\.header-inner \{[\s\S]*?border-radius: var\(--card-radius\);/);
      assert.match(css, /--card-shadow: rgba\(0, 0, 0, 0\.35\);/);
      assert.match(css, /\.header-inner \{[\s\S]*?box-shadow: 0 8px 24px var\(--card-shadow\);/);
    });

    it('GET / should use one shared vertical gap between the main sections', async () => {
      const css = await (await fetch(`${baseUrl}/web-client.css`)).text();
      assert.match(css, /--section-gap: 24px;/);
      assert.match(css, /header \{[\s\S]*?height: calc\(var\(--header-height\) \+ var\(--section-gap\)\);/);
      assert.match(css, /header \{[\s\S]*?padding: var\(--section-gap\) 20px 0;/);
      assert.match(css, /main \{[\s\S]*?padding: var\(--section-gap\) 20px 48px;/);
      assert.match(css, /\.indexer-warnings \{[\s\S]*?margin: 0 0 var\(--section-gap\);/);
      assert.match(css, /\.search-panel \{[\s\S]*?margin-bottom: var\(--section-gap\);/);
      assert.match(css, /\.results-bar \{[\s\S]*?margin-bottom: var\(--section-gap\);/);
      assert.match(css, /--section-gap: 16px;/);
      assert.match(css, /padding: var\(--section-gap\) 12px 36px;/);
    });

    it('GET /login should redirect to / in public mode', async () => {
      const res = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/');
    });

    it('POST /login should redirect to / in public mode', async () => {
      const formData = new URLSearchParams({ apiKey: 'any-key' });
      const res = await fetch(`${baseUrl}/login`, {
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/');
    });
  });

  describe('Protected Mode (apiKey set)', () => {
    const sampleApiKey = 'sample-secret-api-key-2026';
    let baseUrl: string;
    let server: http.Server;

    before(async () => {
      const httpClient = new HttpClient();
      const registry = new ProviderRegistry(httpClient);
      const app = createApp(registry, { apiKey: sampleApiKey });

      server = http.createServer(app);
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    after(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
    });

    it('GET / without authentication should redirect to /login', async () => {
      const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/login');
    });

    it('GET /login should render the web login page with 200 status', async () => {
      const res = await fetch(`${baseUrl}/login`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /text\/html/);

      const html = await res.text();
      assert.match(html, /TorrGate/);
      assert.match(html, /action="\/login"/);
      assert.match(html, /id="apiKey"/);
      assert.match(html, /id="theme-toggle"/);
      assert.match(html, /<meta name="theme-color" id="theme-color" content="#0f0f0f">/);
      assert.match(html, /<script src="\/theme\.js"><\/script>/);
      assert.match(html, /<link rel="stylesheet" href="\/login\.css">/);
      assert.ok(!html.includes('<style>'));
      assert.ok(!html.includes('<script>'));
    });

    it('GET /login.css should serve the same-origin login stylesheet', async () => {
      const res = await fetch(`${baseUrl}/login.css`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /text\/css/);
      assert.equal(res.headers.get('cache-control'), 'no-cache');
      const css = await res.text();
      assert.match(css, /\.card \{/);
      assert.match(css, /--button-bg: #ffffff;/);
      assert.match(css, /--button-bg: #18181b;/);
      assert.match(css, /:root\[data-theme='light'\] \{[\s\S]*?--button-bg: #18181b;/);
      assert.match(css, /button\[type=submit\] \{[\s\S]*?background: var\(--button-bg\);/);
      assert.match(css, /\.card \{[\s\S]*?border-radius: var\(--card-radius\);/);
      assert.match(css, /\.theme-toggle \{[\s\S]*?background: var\(--surface\);[\s\S]*?border-radius: 8px;/);
      assert.match(css, /\.theme-toggle:hover \{[\s\S]*?background: var\(--surface-elevated\);/);
    });

    it('GET /theme.js should serve the shared theme behavior', async () => {
      const res = await fetch(`${baseUrl}/theme.js`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /application\/javascript/);
      assert.equal(res.headers.get('cache-control'), 'no-cache');
      assert.equal(await res.text(), THEME_SCRIPT);
    });

    it('POST /login with incorrect API key should fail with 401 and display error', async () => {
      const formData = new URLSearchParams({ apiKey: 'wrong-key', returnUrl: '/' });
      const res = await fetch(`${baseUrl}/login`, {
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      });
      assert.equal(res.status, 401);

      const html = await res.text();
      assert.match(html, /Invalid API key/);
      assert.ok(!res.headers.get('set-cookie')?.includes('torrgate_session='));
    });

    it('POST /login with valid API key should redirect and set session cookies', async () => {
      const formData = new URLSearchParams({ apiKey: sampleApiKey, returnUrl: '/' });
      const res = await fetch(`${baseUrl}/login`, {
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/');

      const setCookie = res.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes('torrgate_session='));
      assert.ok(setCookie.includes('HttpOnly'));
      assert.ok(setCookie.includes('SameSite=Lax'));
    });

    it('GET / with valid session cookie should return web client with Sign Out button', async () => {
      const formData = new URLSearchParams({ apiKey: sampleApiKey, returnUrl: '/' });
      const loginRes = await fetch(`${baseUrl}/login`, {
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        redirect: 'manual',
      });
      const cookieHeader = loginRes.headers.get('set-cookie') || '';

      const res = await fetch(`${baseUrl}/`, {
        headers: { Cookie: cookieHeader },
      });
      assert.equal(res.status, 200);

      const html = await res.text();
      assert.match(html, /TorrGate/);
      assert.match(html, /Sign Out/);
      assert.match(html, /id="query-input"/);
    });

    it('GET /api/v2.0/indexers with session cookie should be authorized', async () => {
      const formData = new URLSearchParams({ apiKey: sampleApiKey, returnUrl: '/' });
      const loginRes = await fetch(`${baseUrl}/login`, {
        body: formData.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        redirect: 'manual',
      });
      const cookieHeader = loginRes.headers.get('set-cookie') || '';

      const res = await fetch(`${baseUrl}/api/v2.0/indexers`, {
        headers: { Cookie: cookieHeader },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data));
    });

    it('POST /login should reject malicious external return URLs and fall back to /', async () => {
      const maliciousUrls = [
        'https://malicious.example.com',
        '//malicious.example.com',
        'javascript:alert(1)',
      ];

      for (const returnUrl of maliciousUrls) {
        const formData = new URLSearchParams({ apiKey: sampleApiKey, returnUrl });
        const res = await fetch(`${baseUrl}/login`, {
          body: formData.toString(),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          method: 'POST',
          redirect: 'manual',
        });
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), '/');
      }
    });

    it('GET /logout should clear session cookies and redirect to /login', async () => {
      const res = await fetch(`${baseUrl}/logout`, { redirect: 'manual' });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/login');

      const setCookie = res.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes('torrgate_session=;'));
      assert.ok(setCookie.includes('Max-Age=0'));
    });
  });
});
