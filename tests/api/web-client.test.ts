// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

import { FORM_STYLES } from '../../src/api/views/form-styles.js';
import { THEME_SCRIPT } from '../../src/api/views/theme-script.js';
import { THEME_STYLES } from '../../src/api/views/theme-styles.js';
import { renderWebClientPage } from '../../src/api/views/web-client.js';
import { WEB_CLIENT_SCRIPT } from '../../src/api/views/web-client-script.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';

describe('Web client interaction states', () => {
  it('should keep primary button text readable in both themes and hover states', () => {
    const dom = new JSDOM(`<style>${THEME_STYLES}</style>`);
    const rules = Array.from(dom.window.document.styleSheets[0].cssRules);
    const dark = rules.find(rule => rule instanceof dom.window.CSSStyleRule && rule.selectorText === ':root') as CSSStyleRule;
    const light = rules.find(rule => rule instanceof dom.window.CSSStyleRule && rule.selectorText === ":root[data-theme='light']") as CSSStyleRule;
    function luminance(color: string): number {
      const channels = color.match(/[a-f\d]{2}/gi)?.map(channel => Number.parseInt(channel, 16) / 255)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      assert.ok(channels && channels.length === 3);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    for (const theme of [dark, light]) {
      const foreground = luminance(theme.style.getPropertyValue('--accent-text'));
      for (const property of ['--accent', '--accent-hover']) {
        const background = luminance(theme.style.getPropertyValue(property));
        const contrast = (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
        assert.ok(contrast >= 4.5, `${theme.selectorText} ${property}: ${contrast}`);
      }
    }
    dom.window.close();
  });

  it('should announce the selected category and render search, empty, and error states', async () => {
    const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
      runScripts: 'outside-only',
      url: 'https://gateway.example.test',
    });
    let searchResponse: Response = Response.json({ Indexers: [], Results: [] });
    Object.assign(dom.window, {
      fetch: async (url: string) => url === '/api/v2.0/indexers'
        ? Response.json([{ id: 'sample', name: 'Sample Tracker', type: 'public' }])
        : searchResponse,
      matchMedia: () => ({ matches: false }),
      torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
    });
    dom.window.eval(WEB_CLIENT_SCRIPT);
    await new Promise<void>(resolve => setImmediate(resolve));
    const document = dom.window.document;
    const category = document.querySelector<HTMLButtonElement>('[data-category="7000"]');
    assert.ok(category);
    category.click();
    assert.equal(category.getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelectorAll('.pill[aria-pressed="true"]').length, 1);
    const form = document.querySelector<HTMLFormElement>('#search-form');
    assert.ok(form);
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    assert.equal(document.querySelectorAll('.skeleton-card').length, 4);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(document.querySelector('#results-stats')?.textContent?.startsWith('0 releases'), true);
    assert.match(document.querySelector('#results-list')?.textContent || '', /No releases found/);
    searchResponse = Response.json({ message: 'Sample tracker unavailable' }, { status: 502 });
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.match(document.querySelector('#results-list')?.textContent || '', /Search failed.*Sample tracker unavailable/);
    document.querySelector<HTMLButtonElement>('#btn-open-trackers')?.click();
    document.querySelector<HTMLButtonElement>('#btn-open-integration')?.click();
    assert.equal(document.querySelector('.modal-overlay.foreground')?.id, 'modal-integration');
    document.querySelector<HTMLButtonElement>('[data-close="modal-integration"]')?.click();
    assert.equal(document.querySelector('.modal-overlay.foreground')?.id, 'modal-trackers');
    dom.window.close();
  });
});

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
      assert.match(html, /id="btn-open-plugins"/);
      assert.match(html, /id="modal-plugins"/);
      assert.match(html, /id="plugin-instance-form"/);
      assert.match(html, /id="modal-plugin-targets"/);
      assert.match(html, /<meta name="theme-color" id="theme-color" content="#141414">/);
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
      assert.match(script, /window\.torrGatePlugins\.register\(/);
      assert.match(script, /Send to TorrPlay/);
      assert.match(script, /api\/v1\/torrents/);
      assert.match(script, /torrGatePluginUi\.renderActions\(item, index\)/);
      assert.match(script, /torrGatePluginUi\.renderActions\(item, idx\)/);
      assert.match(script, /torrGatePluginUi\.renderActions\(item, idx\) \+\s+magnetBtn \+/);
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
      assert.match(styleText, /--accent-text: #041b15;/);
      assert.match(styleText, /:root\[data-theme='light'\] \{[\s\S]*?--surface: #ffffff;/);
      assert.match(styleText, /:root\[data-theme='light'\] \{[\s\S]*?--accent-text: #ffffff;/);
      assert.match(styleText, /\.brand-logo \{[\s\S]*?color: var\(--accent\);/);
      assert.ok(styleText.includes(FORM_STYLES));
      assert.match(styleText, /\.header-right \.nav-btn span:not\(#theme-toggle-icon\) \{[\s\S]*?display: none;/);

      const script = await fetch(`${baseUrl}/web-client.js`);
      assert.equal(script.status, 200);
      assert.match(script.headers.get('content-type') || '', /application\/javascript/);
      assert.equal(script.headers.get('cache-control'), 'no-cache');
      const scriptText = await script.text();
      assert.match(scriptText, /function performSearch\(\)/);
      assert.ok(!scriptText.includes('onclick='));
    });

    it('GET / should label search controls and icon navigation', async () => {
      const dom = new JSDOM(await (await fetch(`${baseUrl}/`)).text());
      const document = dom.window.document;
      for (const id of ['query-input', 'indexer-select', 'sort-select']) {
        assert.ok(document.querySelector(`label[for="${id}"]`)?.textContent?.trim(), id);
      }
      for (const control of document.querySelectorAll('.header-right .nav-btn')) {
        assert.ok(control.getAttribute('aria-label'), control.id);
      }
      assert.equal(document.querySelector('body > footer.workspace-footer')?.previousElementSibling?.tagName, 'MAIN');
      assert.equal(document.querySelector('#category-pills .active')?.getAttribute('aria-pressed'), 'true');
      dom.window.close();
    });

    it('GET / should keep sticky navigation and categories in separate scrolling rows', async () => {
      const css = await (await fetch(`${baseUrl}/web-client.css`)).text();
      const dom = new JSDOM(`<style>${css}</style>`);
      const rules = Array.from(dom.window.document.styleSheets[0].cssRules);
      for (const selector of ['.header-right', '.filter-pills']) {
        const rule = rules.find(rule => rule instanceof dom.window.CSSStyleRule && rule.selectorText === selector) as CSSStyleRule;
        assert.equal(rule.style.getPropertyValue('flex-wrap'), 'nowrap', selector);
        assert.equal(rule.style.getPropertyValue('overflow-x'), 'auto', selector);
      }
      const header = rules.find(rule => rule instanceof dom.window.CSSStyleRule && rule.selectorText === 'header') as CSSStyleRule;
      assert.equal(header.style.getPropertyValue('position'), 'sticky');
      assert.equal(header.style.getPropertyValue('top'), '0');
      assert.equal(header.style.getPropertyValue('background'), 'var(--surface)');
      dom.window.close();
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
      assert.match(html, /<meta name="theme-color" id="theme-color" content="#141414">/);
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
      assert.ok(css.includes(FORM_STYLES));
      assert.match(css, /--accent-text: #041b15;/);
      assert.match(css, /--accent-text: #ffffff;/);
      assert.match(css, /:root\[data-theme='light'\] \{[\s\S]*?--accent-text: #ffffff;/);
      assert.match(css, /\.form-button\.primary \{[\s\S]*?background: var\(--accent\);/);
      const dom = new JSDOM(await (await fetch(`${baseUrl}/login`)).text());
      assert.equal(dom.window.document.querySelector('h1')?.textContent, 'API Key');
      const apiKeyInput = dom.window.document.querySelector<HTMLInputElement>('.login-form #apiKey');
      assert.equal(apiKeyInput?.getAttribute('aria-label'), 'API key');
      assert.equal(apiKeyInput?.type, 'password');
      assert.equal(apiKeyInput?.required, true);
      dom.window.close();
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
