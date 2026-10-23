// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MemoryCache } from '../../../src/cache/memory-cache.js';
import { getTopicPathStore } from '../../../src/cache/topic-path-cache.js';
import { HttpClient } from '../../../src/http/http-client.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';
import { testCardigannDefinition, testCardigannHtml } from '../../fixtures/cardigann.fixture.js';

describe('CardigannProvider topic details', () => {
  it('should scrape topic details when getTopicDetails is invoked', async () => {
    const httpClient = new HttpClient();
    const provider = new CardigannProvider(testCardigannDefinition, httpClient);

    const detailsHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Пример Релиза / Sample Release (2024)</title></head>
          <body>
            <h1 class="topic-title">Пример Релиза / Sample Release (2024)</h1>
            <a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567">Download Magnet</a>
            <a href="/download/500001.torrent">Download Torrent</a>
            <img src="https://example.org/poster.jpg" alt="poster" />
            <div class="post_body">Detailed sample description</div>
          </body>
        </html>
      `;

    httpClient.getDecoded = async () => detailsHtml;

    const details = await provider.getTopicDetails('500001');
    assert.ok(details);
    assert.equal(details.id, '500001');
    assert.match(details.name, /Sample Release/);
    assert.equal(details.infoHash, '0123456789ABCDEF0123456789ABCDEF01234567');
    assert.ok(details.magnetUri.toLowerCase().startsWith('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'));
    assert.equal(details.posterUrl, 'https://example.org/poster.jpg');
    assert.ok(details.description?.includes('Detailed sample description'));
  });

  it('should resolve topicPath using declarative details.path template', async () => {
    const httpClient = new HttpClient();
    const definitionWithDetails: CardigannDefinition = {
      ...testCardigannDefinition,
      details: {
        path: 'custom/topic/{{ .Id }}',
      },
      search: {
        ...testCardigannDefinition.search,
        paths: [{ path: 'forum/tracker.php' }],
      },
    };
    const provider = new CardigannProvider(definitionWithDetails, httpClient);

    let requestedPath = '';
    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedPath = await builder('https://example.org');
      return {
        baseUrl: 'https://example.org',
        content: '<title>Sample Title</title><h1>Sample Topic</h1>',
        workingUrl: 'https://example.org',
      };
    };

    const details = await provider.getTopicDetails('777123');
    assert.ok(details);
    assert.equal(requestedPath, 'https://example.org/custom/topic/777123');
  });

  it('should resolve topicPath using fallback inferred from details selector', async () => {
    const httpClient = new HttpClient();
    const definitionWithSelector: CardigannDefinition = {
      ...testCardigannDefinition,
      details: undefined,
      search: {
        ...testCardigannDefinition.search,
        fields: {
          ...testCardigannDefinition.search.fields,
          details: {
            attribute: 'href',
            selector: 'a[href^="viewtopic.php?t="]',
          },
        },
      },
    };
    const provider = new CardigannProvider(definitionWithSelector, httpClient);

    let requestedPath = '';
    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedPath = await builder('https://example.org');
      return {
        baseUrl: 'https://example.org',
        content: '<title>Sample Title</title><h1>Sample Topic</h1>',
        workingUrl: 'https://example.org',
      };
    };

    const details = await provider.getTopicDetails('888456');
    assert.ok(details);
    assert.equal(requestedPath, 'https://example.org/viewtopic.php?t=888456');
  });

  for (const { hrefPrefix, topicUrl } of [
    { hrefPrefix: 'viewtopic.php?t=', topicUrl: 'https://example.org/forum/viewtopic.php?t=42' },
    { hrefPrefix: './viewtopic.php?t=', topicUrl: 'https://example.org/forum/viewtopic.php?t=42' },
    { hrefPrefix: '/viewtopic.php?t=', topicUrl: 'https://example.org/viewtopic.php?t=42' },
    { hrefPrefix: '../viewtopic.php?t=', topicUrl: 'https://example.org/viewtopic.php?t=42' },
    { hrefPrefix: '//example.org/forum/viewtopic.php?t=', topicUrl: 'https://example.org/forum/viewtopic.php?t=42' },
    { hrefPrefix: 'https://example.org/forum/viewtopic.php?t=', topicUrl: 'https://example.org/forum/viewtopic.php?t=42' },
  ]) {
    it(`should resolve inferred ${hrefPrefix} topic links against the search page directory`, async () => {
      const httpClient = new HttpClient();
      const requestedUrls: string[] = [];
      httpClient.getDecoded = async url => {
        requestedUrls.push(url);
        return url.endsWith('/forum/tracker.php')
          ? `<table class="results"><tr class="item-row"><td><a href="${hrefPrefix}42">Sample Topic</a></td></tr></table>`
          : '<h1>Sample Topic</h1>';
      };
      const provider = new CardigannProvider({
        ...testCardigannDefinition,
        search: {
          ...testCardigannDefinition.search,
          fields: {
            details: { attribute: 'href', selector: `a[href^="${hrefPrefix}"]` },
            id: { text: 42 },
            title: { selector: 'a' },
          },
          paths: [{ path: 'forum/tracker.php' }],
        },
      }, httpClient);

      const cache = new MemoryCache<unknown>();
      provider.shareTopicPaths(cache, 'sample-topic-paths', 300);
      const [result] = await provider.searchByTitle({ query: 'Sample' });
      assert.equal(result.url, topicUrl);
      const entry = provider.getTopicPathCacheEntry(result);
      assert.ok(entry);
      const expectedUrl = new URL(topicUrl);
      const expectedPath = `.${expectedUrl.pathname}${expectedUrl.search}`;
      assert.equal(entry.value, expectedPath);
      assert.equal(getTopicPathStore(cache).get(entry.key), expectedPath);
      const details = await provider.getTopicDetails(result.id);
      assert.ok(details);
      assert.equal(requestedUrls[1], topicUrl);
      assert.equal(details.url, result.url);
    });
  }

  for (const shouldUseForum of [true, false]) {
    it(`should render inferred search paths with configured useforum=${shouldUseForum} and default pagination`, async () => {
      const httpClient = new HttpClient();
      const requestedUrls: string[] = [];
      httpClient.getDecoded = async url => {
        requestedUrls.push(url);
        return new URL(url).pathname.endsWith('/tracker.php')
          ? '<table class="results"><tr class="item-row"><td><a href="viewtopic.php?t=42">Sample Topic</a></td></tr></table>'
          : '<h1>Sample Topic</h1>';
      };
      const provider = new CardigannProvider({
        ...testCardigannDefinition,
        search: {
          ...testCardigannDefinition.search,
          fields: {
            details: { attribute: 'href', selector: 'a[href^="viewtopic.php?t="]' },
            id: { text: 42 },
            title: { selector: 'a' },
          },
          paths: [{ path: '{{ if .Config.useforum }}forum/tracker.php{{ else }}tracker.php{{ end }}?page={{ .Category }}&year={{ .Query.Year }}' }],
        },
        settings: [{ default: shouldUseForum, name: 'useforum', type: 'checkbox' }],
      }, httpClient);

      const directory = shouldUseForum ? 'forum/' : '';
      const topicUrl = `https://example.org/${directory}viewtopic.php?t=42`;
      const details = await provider.getTopicDetails('42');
      assert.ok(details);
      assert.equal(details.url, topicUrl);
      const [result] = await provider.searchByTitle({ query: 'Sample' });
      assert.equal(result.url, details.url);
      assert.deepEqual(requestedUrls, [
        topicUrl,
        `https://example.org/${directory}tracker.php?page=0&year=`,
      ]);
    });
  }

  it('should render inferred search paths with each mirror sitelink during fallback', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => {
      requestedUrls.push(url);
      if (url.startsWith('https://primary.example/')) {
        throw new Error('Sample mirror unavailable');
      }
      return '<h1>Sample Topic</h1>';
    };
    const provider = new CardigannProvider({
      ...testCardigannDefinition,
      links: ['https://primary.example/base/', 'https://secondary.example/base/'],
      search: {
        ...testCardigannDefinition.search,
        fields: {
          details: { attribute: 'href', selector: 'a[href^="viewtopic.php?t="]' },
          title: { selector: 'a' },
        },
        paths: [{ path: '{{ .Config.sitelink }}forum/tracker.php' }],
      },
    }, httpClient);

    const details = await provider.getTopicDetails('42');
    assert.ok(details);
    assert.deepEqual(requestedUrls, [
      'https://primary.example/base/forum/viewtopic.php?t=42',
      'https://secondary.example/base/forum/viewtopic.php?t=42',
    ]);
    assert.equal(details.url, requestedUrls[1]);
  });

  it('should preserve topic URLs from searches whose directory depends on keywords and year', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => {
      requestedUrls.push(url);
      return new URL(url).pathname.endsWith('/tracker.php')
        ? '<table class="results"><tr class="item-row"><td><a href="viewtopic.php?t=42&amp;ref=sample">Sample Topic</a></td></tr></table>'
        : '<h1>Sample Topic</h1>';
    };
    const provider = new CardigannProvider({
      ...testCardigannDefinition,
      search: {
        ...testCardigannDefinition.search,
        fields: {
          details: { attribute: 'href', selector: 'a[href^="viewtopic.php?t="]' },
          title: { selector: 'a' },
        },
        paths: [{ path: '{{ if .Keywords }}forum/{{ .Query.Year }}/2/tracker.php{{ else }}tracker.php{{ end }}' }],
      },
    }, httpClient);

    const [result] = await provider.searchByTitle({ query: 'Sample', year: 2024 });
    const details = await provider.getTopicDetails(result.id);
    assert.ok(details);
    assert.equal(details.url, result.url);
    assert.deepEqual(requestedUrls, [
      'https://example.org/forum/2024/2/tracker.php',
      'https://example.org/forum/2024/2/viewtopic.php?t=42&ref=sample',
    ]);
  });

  it('should preserve remembered topic paths when falling back to mirrors with different base directories', async () => {
    const httpClient = new HttpClient();
    let isPrimaryUnavailable = false;
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => {
      requestedUrls.push(url);
      if (isPrimaryUnavailable && url.startsWith('https://primary.example/')) {
        throw new Error('Sample mirror unavailable');
      }
      return new URL(url).pathname.endsWith('/tracker.php')
        ? '<table class="results"><tr class="item-row"><td><a href="viewtopic.php?t=42">Sample Topic</a></td></tr></table>'
        : '<h1>Sample Topic</h1>';
    };
    const provider = new CardigannProvider({
      ...testCardigannDefinition,
      links: ['https://primary.example/base/', 'https://secondary.example/mirror/'],
      search: {
        ...testCardigannDefinition.search,
        fields: {
          details: { attribute: 'href', selector: 'a[href^="viewtopic.php?t="]' },
          title: { selector: 'a' },
        },
        paths: [{ path: '{{ if .Keywords }}forum/tracker.php{{ else }}tracker.php{{ end }}' }],
      },
    }, httpClient);

    const [result] = await provider.searchByTitle({ query: 'Sample' });
    isPrimaryUnavailable = true;
    const details = await provider.getTopicDetails(result.id);
    assert.ok(details);
    assert.deepEqual(requestedUrls, [
      'https://primary.example/base/forum/tracker.php',
      'https://primary.example/base/forum/viewtopic.php?t=42',
      'https://secondary.example/mirror/forum/viewtopic.php?t=42',
    ]);
    assert.equal(details.url, requestedUrls[2]);
  });

  it('should use an explicit details path after a search has returned a different topic URL', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => {
      requestedUrls.push(url);
      return url.endsWith('/search') ? testCardigannHtml : '<h1>Sample Topic</h1>';
    };
    const provider = new CardigannProvider({
      ...testCardigannDefinition,
      details: { path: 'custom/topic/{{ .Id }}' },
      search: { ...testCardigannDefinition.search, paths: [{ path: '/search' }] },
    }, httpClient);

    const [result] = await provider.searchByTitle({ query: 'Sample' });
    const details = await provider.getTopicDetails(result.id);
    assert.ok(details);
    assert.equal(details.url, 'https://example.org/custom/topic/500001');
    assert.deepEqual(requestedUrls, [
      'https://example.org/search',
      'https://example.org/custom/topic/500001',
    ]);
  });

  it('should keep detail requests on the tracker when search results contain external topic links', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => {
      requestedUrls.push(url);
      return url.endsWith('/search')
        ? '<table class="results"><tr class="item-row"><td><a href="https://external.example/viewtopic.php?t=42">Sample Topic</a></td></tr></table>'
        : '<h1>Sample Topic</h1>';
    };
    const provider = new CardigannProvider({
      ...testCardigannDefinition,
      search: {
        ...testCardigannDefinition.search,
        fields: {
          details: { attribute: 'href', selector: 'a' },
          title: { selector: 'a' },
        },
        paths: [{ path: '/search' }],
      },
    }, httpClient);

    const [result] = await provider.searchByTitle({ query: 'Sample' });
    const details = await provider.getTopicDetails(result.id);
    assert.ok(details);
    assert.equal(details.url, 'https://example.org/details.php?id=42');
    assert.deepEqual(requestedUrls, [
      'https://example.org/search',
      'https://example.org/details.php?id=42',
    ]);
  });

  it('should safely return null and log warning when getTopicDetails throws', async () => {
    const httpClient = new HttpClient();
    const provider = new CardigannProvider(testCardigannDefinition, httpClient);
    (provider as unknown as { fetchWithFallback: () => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      throw new Error('Network failure');
    };

    const details = await provider.getTopicDetails('99999');
    assert.equal(details, null);
  });
});
