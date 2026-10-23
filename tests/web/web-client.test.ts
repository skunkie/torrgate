// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { JSDOM } from 'jsdom';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { WEB_CLIENT_SCRIPT } from '../../src/web/client/web-client-script.js';
import { WEB_CLIENT_STYLES } from '../../src/web/client/web-client-styles.js';
import { FORM_STYLES } from '../../src/web/shared/form-styles.js';
import { THEME_SCRIPT } from '../../src/web/shared/theme-script.js';
import { THEME_STYLES } from '../../src/web/shared/theme-styles.js';
import { renderWebClientPage } from '../../src/web/web-client.js';

describe('Web client interaction states', () => {
  for (const metadata of [
    { Description: 'Тестовое описание <img src=x onerror="alert(1)"> & release notes', Poster: 'https://tracker.example.test/poster.jpg' },
    { Description: 'Sample release notes', Poster: 'http://images.example.test/poster.jpg' },
    { Description: 'Sample release notes', Poster: 'javascript:alert(1)' },
    { Description: undefined, Poster: 'https://tracker.example.test/poster.jpg' },
    { Description: undefined, Poster: undefined },
  ]) {
    it(`should safely render search metadata in release details with ${metadata.Poster || 'no poster'} and ${metadata.Description ? 'a description' : 'no description'}`, async context => {
      const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
        runScripts: 'outside-only',
        url: 'https://gateway.example.test',
      });
      context.after(() => dom.window.close());
      Object.assign(dom.window, {
        fetch: async (url: string) => url === '/api/v2.0/indexers'
          ? Response.json([{ id: 'sample', name: 'Sample Tracker', type: 'public' }])
          : Response.json({
            Indexers: [],
            Results: [{ ...metadata, Category: [], Peers: 2, Seeders: 1, Size: 1024, Title: 'Sample "Release"', Tracker: 'Sample Tracker' }],
          }),
        matchMedia: () => ({ matches: false }),
        torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
      });
      dom.window.eval(WEB_CLIENT_SCRIPT);
      await new Promise<void>(resolve => setImmediate(resolve));
      const document = dom.window.document;
      document.querySelector('#search-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      await new Promise<void>(resolve => setImmediate(resolve));
      document.querySelector<HTMLButtonElement>('.btn-view-details')!.click();
      const body = document.querySelector('#details-modal-body')!;
      assert.equal(body.querySelector('.details-description')?.textContent, metadata.Description);
      assert.equal(body.querySelectorAll('.details-description img, .details-description script, [onerror]').length, 0);
      const poster = body.querySelector<HTMLImageElement>('.details-poster');
      if (metadata.Poster && /^https?:/.test(metadata.Poster)) {
        assert.ok(poster);
        assert.equal(poster.getAttribute('src'), metadata.Poster);
        assert.equal(poster.alt, 'Poster for Sample "Release"');
        assert.equal(poster.getAttribute('referrerpolicy'), 'no-referrer');
        poster.dispatchEvent(new dom.window.Event('error'));
        assert.equal(body.querySelector('.details-poster'), null);
        assert.equal(Boolean(body.querySelector('.details-metadata')), Boolean(metadata.Description));
      } else {
        assert.equal(poster, null);
      }
      assert.equal(document.querySelector('#modal-details')?.classList.contains('open'), true);
    });
  }

  for (const query of ['', 'Sample Release']) {
    it(`should search immediately when categories change with ${query ? 'a search term' : 'an empty search term'}`, async context => {
      const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
        runScripts: 'outside-only',
        url: 'https://gateway.example.test',
      });
      context.after(() => dom.window.close());
      const searchUrls: URL[] = [];
      Object.assign(dom.window, {
        fetch: async (url: string) => {
          if (url === '/api/v2.0/indexers') {
            return Response.json([{ id: 'sample', name: 'Sample Tracker', type: 'public' }]);
          }
          searchUrls.push(new URL(url, dom.window.location.origin));
          return Response.json({ Indexers: [], Results: [] });
        },
        matchMedia: () => ({ matches: false }),
        torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
      });
      dom.window.eval(WEB_CLIENT_SCRIPT);
      await new Promise<void>(resolve => setImmediate(resolve));
      const document = dom.window.document;
      document.querySelector<HTMLInputElement>('#query-input')!.value = query;

      for (const [index, category] of ['2000', '5000', '3000', '4000', '7000', ''].entries()) {
        document.querySelector<HTMLButtonElement>(`[data-category="${category}"]`)!.click();
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(searchUrls.length, index + 1);
        const url = searchUrls.at(-1)!;
        assert.equal(url.pathname, '/api/v2.0/indexers/all/results');
        assert.equal(url.searchParams.get('category'), category || null);
        assert.equal(url.searchParams.get('query'), query || null);
        assert.equal(document.querySelector('.pill[aria-pressed="true"]')?.getAttribute('data-category'), category);
      }
    });
  }

  for (const staleOutcome of ['response', 'failure', 'body'] as const) {
    it(`should retain the latest search results after a superseded ${staleOutcome}`, async context => {
      const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
        runScripts: 'outside-only',
        url: 'https://gateway.example.test',
      });
      context.after(() => dom.window.close());
      const requests: Array<{
        reject: (reason: Error) => void;
        resolve: (response: Response) => void;
        signal: AbortSignal;
      }> = [];
      Object.assign(dom.window, {
        fetch: (url: string, options: RequestInit) => url === '/api/v2.0/indexers'
          ? Promise.resolve(Response.json([{ id: 'sample', name: 'Sample Tracker', type: 'public' }]))
          : new Promise<Response>((resolve, reject) => {
            requests.push({ reject, resolve, signal: options.signal as AbortSignal });
          }),
        matchMedia: () => ({ matches: false }),
        torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
      });
      dom.window.eval(WEB_CLIENT_SCRIPT);
      const settle = () => new Promise<void>(resolve => setImmediate(resolve));
      await settle();
      const document = dom.window.document;
      const queryInput = document.querySelector<HTMLInputElement>('#query-input')!;
      const form = document.querySelector<HTMLFormElement>('#search-form')!;
      const submit = (query: string): void => {
        queryInput.value = query;
        form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      };
      const createResponse = (title: string): Response => Response.json({
        Indexers: [],
        Results: [{ Category: [], Size: 1024, Title: title, Tracker: 'Sample Tracker' }],
      });
      submit('First Sample');
      let resolveBody!: (value: unknown) => void;
      if (staleOutcome === 'body') {
        const response = createResponse('First Sample');
        response.json = () => new Promise(resolve => { resolveBody = resolve; });
        requests[0].resolve(response);
        await settle();
      }
      submit('Second Sample');
      assert.equal(requests[0].signal.aborted, true);
      requests[1].resolve(createResponse('Second Sample'));
      await settle();
      const latestResults = document.querySelector('#results-list')!.textContent;
      assert.match(latestResults || '', /Second Sample/);

      if (staleOutcome === 'response') requests[0].resolve(createResponse('First Sample'));
      else if (staleOutcome === 'failure') requests[0].reject(new Error('Sample network failure'));
      else resolveBody(await createResponse('First Sample').json());
      await settle();

      assert.equal(queryInput.value, 'Second Sample');
      assert.equal(document.querySelector('#results-list')!.textContent, latestResults);
    });
  }

  it('should join field focus outlines to their accent borders', () => {
    const styles = FORM_STYLES.replaceAll('var(--accent)', '#10b981').replaceAll('var(--border)', '#2d2d2d');
    const dom = new JSDOM(`<style>${styles}</style>
      <input class="form-input"><input class="copy-input" readonly>
      <select class="form-input"><option>Sample Tracker</option></select>
      <select class="copy-input"><option>Sample Client</option></select>`);
    for (const field of dom.window.document.querySelectorAll<HTMLElement>('input, select')) {
      field.focus();
      const style = dom.window.getComputedStyle(field);
      assert.equal(style.borderColor, 'rgb(16, 185, 129)');
      assert.equal(style.outline, '2px solid #10b981');
      assert.ok(Number.parseFloat(style.outlineOffset) + Number.parseFloat(style.borderWidth) <= 0);
    }
    dom.window.close();
  });

  it('should match the category selection fill and leave space inside the result outline', () => {
    const dom = new JSDOM(`<style>${WEB_CLIENT_STYLES}</style><div class="torrent-card active-card"></div>`);
    const rules = Array.from(dom.window.document.styleSheets[0].cssRules);
    function getStyle(selector: string): CSSStyleDeclaration {
      const rule = rules.find(rule => rule instanceof dom.window.CSSStyleRule && rule.selectorText === selector) as CSSStyleRule;
      assert.ok(rule, selector);
      return rule.style;
    }
    const selection = getStyle('.torrent-card.active-card');
    assert.equal(selection.getPropertyValue('background'), getStyle('.pill.active').getPropertyValue('background'));
    assert.equal(selection.getPropertyValue('outline'), '2px solid var(--accent)');
    const outlineInset = -Number.parseFloat(selection.getPropertyValue('outline-offset'));
    const card = dom.window.document.querySelector('.torrent-card');
    assert.ok(card);
    const spacing = dom.window.getComputedStyle(card);
    for (const padding of [spacing.paddingTop, spacing.paddingRight, spacing.paddingBottom, spacing.paddingLeft]) {
      assert.ok(Number.parseFloat(padding) >= outlineInset + 8, padding);
    }
    dom.window.close();
  });

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
        : searchResponse.clone(),
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
    let testServer: http.Server;

    before(async () => {
      const httpClient = new HttpClient();
      const registry = new ProviderRegistry(httpClient);
      const app = createApp(registry);

      testServer = http.createServer(app);
      await new Promise<void>(resolve => {
        testServer.listen(0, '127.0.0.1', () => {
          const addr = testServer.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    after(async () => {
      await new Promise<void>(resolve => testServer.close(() => resolve()));
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
    });

    it('should render tracker failures as text and clear the notice after a successful search', async context => {
      const html = await (await fetch(`${baseUrl}/`)).text();
      const script = await (await fetch(`${baseUrl}/web-client.js`)).text();
      const dom = new JSDOM(html, { runScripts: 'outside-only', url: baseUrl });
      context.after(() => dom.window.close());
      let testIndexerStatuses: { Error: null | string; ID: string; Name: string }[] = [];
      const failures = [
        { Error: 'Sample <img src=x onerror="sample()"> & failure', ID: 'sample', Name: 'Тестовый <script>sample()</script>' },
        { Error: 'Second sample failure', ID: '<img src=x>fallback-id', Name: '' },
      ];
      const successfulStatus = { Error: null, ID: 'success', Name: 'Successful Sample Tracker' };
      Object.assign(dom.window, {
        fetch: async (url: string) => url === '/api/v2.0/indexers'
          ? Response.json([{ id: 'sample', name: 'Sample Tracker', type: 'public' }])
          : Response.json({ Indexers: testIndexerStatuses, Results: [] }),
        matchMedia: () => ({ matches: false }),
      });
      dom.window.eval(script);
      await new Promise<void>(resolve => setImmediate(resolve));
      const { document } = dom.window;
      const warnings = document.querySelector<HTMLElement>('#indexer-warnings');
      assert.ok(warnings);
      assert.equal(warnings.getAttribute('role'), 'status');
      assert.equal(warnings.hidden, true);
      const form = document.querySelector<HTMLFormElement>('#search-form');
      assert.ok(form);

      for (const statuses of [[failures[0], successfulStatus], failures, [successfulStatus]]) {
        testIndexerStatuses = statuses;
        form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
        await new Promise<void>(resolve => setImmediate(resolve));

        const expectedFailures = statuses.filter(status => status.Error);
        assert.equal(warnings.hidden, expectedFailures.length === 0);
        assert.deepEqual(
          [...warnings.querySelectorAll('li')].map(item => item.textContent),
          expectedFailures.map(status => `${status.Name || status.ID} — ${status.Error}`)
        );
        assert.deepEqual(
          [...warnings.querySelectorAll('li strong')].map(name => name.textContent),
          expectedFailures.map(status => status.Name || status.ID)
        );
        assert.equal(warnings.querySelectorAll('img, script').length, 0);
        if (expectedFailures.length > 0) {
          assert.equal(warnings.firstElementChild?.textContent, expectedFailures.length === 1
            ? '1 tracker could not be searched:'
            : `${expectedFailures.length} trackers could not be searched:`);
        } else {
          assert.equal(warnings.textContent, '');
        }
      }
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
    let testServer: http.Server;

    before(async () => {
      const httpClient = new HttpClient();
      const registry = new ProviderRegistry(httpClient);
      const app = createApp(registry, { apiKey: sampleApiKey });

      testServer = http.createServer(app);
      await new Promise<void>(resolve => {
        testServer.listen(0, '127.0.0.1', () => {
          const addr = testServer.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    after(async () => {
      await new Promise<void>(resolve => testServer.close(() => resolve()));
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

describe('Web client peer counts', () => {
  for (const [seeders, leechers] of [[42, 5], [null, null]]) {
    it(`should show seeders ${seeders} and JSON leechers ${leechers} on cards and in details`, async context => {
      const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
        runScripts: 'outside-only',
        url: 'https://gateway.example.test',
      });
      context.after(() => dom.window.close());
      Object.assign(dom.window, {
        fetch: async (url: string) => url === '/api/v2.0/indexers'
          ? Response.json([{ id: 'sample', name: 'Sample Tracker', type: 'public' }])
          : Response.json({
            Indexers: [],
            Results: [{ Category: [], Peers: leechers, Seeders: seeders, Size: 1024, Title: 'Sample Release', Tracker: 'Sample Tracker' }],
          }),
        matchMedia: () => ({ matches: false }),
        torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
      });
      dom.window.eval(WEB_CLIENT_SCRIPT);
      await new Promise<void>(resolve => setImmediate(resolve));
      const document = dom.window.document;
      document.querySelector('#search-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      await new Promise<void>(resolve => setImmediate(resolve));

      assert.equal(document.querySelector('.torrent-card .stat-leech')?.textContent, `▼ ${leechers ?? 0}`);
      assert.equal(document.querySelector('.torrent-card .stat-seed')?.textContent, `▲ ${seeders ?? 0}`);
      document.querySelector<HTMLButtonElement>('.btn-view-details')!.click();
      assert.equal(document.querySelector('#details-modal-body .stat-leech')?.textContent, `▼ ${leechers ?? 0} leechers`);
      assert.equal(document.querySelector('#details-modal-body .stat-seed')?.textContent, `▲ ${seeders ?? 0} seeders`);
    });
  }
});

describe('Web client release sizes', () => {
  it('should show a release without a size as unknown rather than 0 B', async context => {
    const dom = new JSDOM(renderWebClientPage({ hasAuth: false }), {
      runScripts: 'outside-only',
      url: 'https://gateway.example.test',
    });
    context.after(() => dom.window.close());
    Object.assign(dom.window, {
      fetch: async (url: string) => url === '/api/v2.0/indexers'
        ? Response.json([{ id: 'sample', name: 'Sample Tracker', type: 'public' }])
        : Response.json({
          Indexers: [],
          Results: [
            { Category: [], Peers: 1, Seeders: 1, Size: null, Title: 'Sample Unsized Release', Tracker: 'Sample Tracker' },
            { Category: [], Peers: 1, Seeders: 1, Size: 0, Title: 'Sample Empty Release', Tracker: 'Sample Tracker' },
          ],
        }),
      matchMedia: () => ({ matches: false }),
      torrGatePluginUi: { initialize: () => {}, renderActions: () => '' },
    });
    dom.window.eval(WEB_CLIENT_SCRIPT);
    await new Promise<void>(resolve => setImmediate(resolve));
    const document = dom.window.document;
    document.querySelector('#search-form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise<void>(resolve => setImmediate(resolve));

    const sizes = [...document.querySelectorAll('.torrent-card .stat-size')].map(element => element.textContent);
    assert.deepEqual(sizes, ['—', '0 B']);
  });
});
