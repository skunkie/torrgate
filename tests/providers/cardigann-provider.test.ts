// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { MemoryCache } from '../../src/cache/memory-cache.js';
import { CacheWrite } from '../../src/cache/store.js';
import { getTopicPathStore } from '../../src/cache/topic-path-cache.js';
import { HttpClient } from '../../src/http/http-client.js';
import { CardigannProvider } from '../../src/providers/cardigann-provider.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { CardigannDefinition } from '../../src/providers/types.js';

describe('CardigannProvider download transport', () => {
  const definition: CardigannDefinition = {
    id: 'sample-secure-tracker',
    links: ['https://tracker.example/'],
    login: { method: 'get', path: 'login' },
    name: 'Sample Secure Tracker',
    search: {
      fields: { title: { selector: 'a' } },
      paths: [{ path: 'search' }],
      rows: { selector: 'tr' },
    },
  };

  it('should reject unconfigured transports before authenticating or sending cookies', async () => {
    const httpClient = new HttpClient();
    let loginCount = 0;
    let requestCount = 0;
    httpClient.getBinary = async () => {
      requestCount++;
      return { data: Buffer.alloc(0), headers: {} };
    };
    const provider = new CardigannProvider(definition, httpClient);
    provider.sessionManager.ensureSessionValid = async () => { loginCount++; return true; };
    provider.sessionManager.getCookieHeader = () => 'bb_session=test-session';

    for (const url of ['http://tracker.example/download', 'https://tracker.example:8443/download']) {
      await assert.rejects(provider.downloadTorrent(url), /not allowed/);
    }
    assert.equal(loginCount, 0);
    assert.equal(requestCount, 0);
  });

  it('should enforce configured transport on authenticated download redirects', async () => {
    const httpClient = new HttpClient();
    const provider = new CardigannProvider(definition, httpClient);
    provider.sessionManager.ensureSessionValid = async () => true;
    provider.sessionManager.getCookieHeader = () => 'bb_session=test-session';
    for (const target of ['http://tracker.example/download', 'https://tracker.example:8443/download']) {
      httpClient.getBinary = async (url, options = {}) => {
        assert.equal(options.headers?.Cookie, 'bb_session=test-session');
        assert.ok(options.beforeRedirect);
        options.beforeRedirect({}, { headers: { location: target }, statusCode: 302 }, { headers: {}, method: 'GET', url });
        return { data: Buffer.alloc(0), headers: {} };
      };
      await assert.rejects(provider.downloadTorrent('https://tracker.example/download'), /not allowed/);
    }
  });
});

describe('CardigannProvider Execution', () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <table class="results">
          <tr class="item-row">
            <td class="date">15-Авг-24</td>
            <td class="title">
              <a href="/torrent/500001/sample-release-2024">Пример Релиза / Sample Release (2024) BDRip</a>
              <a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"></a>
              <a href="https://d.example.org/download/500001"></a>
            </td>
            <td class="size">1.45 GB</td>
            <td class="seeds"><span class="green">150</span></td>
            <td class="leech"><span class="red">12</span></td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const sampleDefinition: CardigannDefinition = {
    links: ['https://example.org'],
    name: 'Sample Tracker',
    search: {
      fields: {
        category: {
          text: 'Movies',
        },
        date: {
          filters: [
            {
              name: 'dateparse',
            },
          ],
          selector: 'td.date',
        },
        details: {
          attribute: 'href',
          selector: 'td.title a[href^="/torrent/"]',
        },
        download: {
          attribute: 'href',
          selector: 'td.title a[href^="https://d.example.org/"]',
        },
        id: {
          attribute: 'href',
          filters: [
            {
              args: ['/torrent/(\\d+).*', '$1'],
              name: 're_replace',
            },
          ],
          selector: 'td.title a[href^="/torrent/"]',
        },
        leechers: {
          selector: 'td.leech',
        },
        magnet: {
          attribute: 'href',
          selector: 'td.title a[href^="magnet:"]',
        },
        seeders: {
          selector: 'td.seeds',
        },
        size: {
          selector: 'td.size',
        },
        title: {
          selector: 'td.title a[href^="/torrent/"]',
        },
      },
      paths: [
        {
          inputs: {
            q: '{{ .Keywords }}',
          },
          path: '/search',
        },
      ],
      rows: {
        selector: 'table.results tr.item-row',
      },
    },
  };

  it('should parse search results from synthetic HTML fixture', async () => {
    const httpClient = new HttpClient();
    const provider = new CardigannProvider(sampleDefinition, httpClient);

    // Override fetchWithFallback to return our synthetic HTML
    (provider as unknown as { fetchWithFallback: () => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      return {
        baseUrl: 'https://example.org',
        content: sampleHtml,
        workingUrl: 'https://example.org',
      };
    };

    const results = await provider.searchByTitle({ page: 0, query: 'Sample Release' });

    assert.equal(results.length, 1);
    const item = results[0];
    assert.equal(item.id, '500001');
    assert.equal(item.name, 'Пример Релиза / Sample Release (2024) BDRip');
    assert.equal(item.date, '2024-08-15');
    assert.equal(item.size, '1.45 GB');
    assert.equal(item.sizeBytes, 1556925645);
    assert.equal(item.seeders, 150);
    assert.equal(item.leechers, 12);
    assert.equal(item.url, 'https://example.org/torrent/500001/sample-release-2024');
    assert.equal(item.torrentUrl, 'https://d.example.org/download/500001');
    assert.equal(item.magnetUri, 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567');
  });

  it('should expose and apply the requested video format', async () => {
    const httpClient = new HttpClient();
    const formatDefinition: CardigannDefinition = {
      ...sampleDefinition,
      search: {
        ...sampleDefinition.search,
        paths: [{ path: '/search?format={{ .Query.Format }}' }],
      },
    };
    const provider = new CardigannProvider(formatDefinition, httpClient);
    const formatHtml = sampleHtml.replace('(2024) BDRip', '(2024) 1080p BDRip');
    let requestedUrl = '';

    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedUrl = await builder('https://example.org');
      return {
        baseUrl: 'https://example.org',
        content: formatHtml,
        workingUrl: 'https://example.org',
      };
    };

    const matchingResults = await provider.searchByTitle({ format: 1080, query: 'Sample Release' });
    const nonMatchingResults = await provider.searchByTitle({ format: 720, query: 'Sample Release' });

    assert.equal(matchingResults.length, 1);
    assert.equal(nonMatchingResults.length, 0);
    assert.equal(requestedUrl, 'https://example.org/search?format=720');
  });

  it('should keep a stable page identity when peer counts change', async () => {
    const httpClient = new HttpClient();
    const pagedDefinition: CardigannDefinition = {
      ...sampleDefinition,
      search: {
        ...sampleDefinition.search,
        paths: [{ path: '/search/{{ .Page }}' }],
      },
    };
    const provider = new CardigannProvider(pagedDefinition, httpClient);
    const pages = [sampleHtml, sampleHtml.replace('150', '151')];
    let pageIndex = 0;

    (provider as unknown as { fetchWithFallback: () => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async () => ({
      baseUrl: 'https://example.org',
      content: pages[pageIndex++] ?? '',
      workingUrl: 'https://example.org',
    });

    const first = await provider.searchPageByTitle({ page: 0, query: 'Sample Release' });
    const second = await provider.searchPageByTitle({ page: 1, query: 'Sample Release' });

    assert.equal(first.items[0]?.seeders, 150);
    assert.equal(second.items[0]?.seeders, 151);
    assert.equal(first.pageIdentity, second.pageIdentity);
  });

  it('should fall back to secondary mirror when urlBuilder fails on primary mirror', async () => {
    const httpClient = new HttpClient();
    const multiMirrorDef: CardigannDefinition = {
      ...sampleDefinition,
      links: ['https://blocked-mirror.org', 'https://working-mirror.org'],
      login: {
        method: 'post',
        path: '/login',
      },
    };
    const provider = new CardigannProvider(multiMirrorDef, httpClient);

    let fetchedUrl = '';
    httpClient.getDecoded = async (url: string) => {
      fetchedUrl = url;
      return sampleHtml;
    };

    provider.sessionManager.ensureAuthenticated = async (baseUrl: string) => {
      if (baseUrl.includes('blocked-mirror')) {
        throw new Error('Connection refused on blocked mirror');
      }
      return true;
    };

    const results = await provider.searchByTitle({ query: 'Sample' });
    assert.equal(results.length, 1);
    assert.match(fetchedUrl, /working-mirror\.org/);
  });

  it('should send search inputs as a windows-1251 form body when the path method is post', async () => {
    const httpClient = new HttpClient();
    const postDefinition: CardigannDefinition = {
      ...sampleDefinition,
      encoding: 'windows-1251',
      search: {
        ...sampleDefinition.search,
        paths: [
          {
            inputs: {
              f: '-1',
              nm: '{{ .Keywords }}',
              unused: '',
            },
            method: 'post',
            path: 'forum/tracker.php',
          },
        ],
      },
    };
    const provider = new CardigannProvider(postDefinition, httpClient);

    let postedUrl = '';
    let postedForm: Record<string, string> = {};
    let postedEncoding = '';
    httpClient.getDecoded = async () => {
      throw new Error('POST search paths must not issue GET requests');
    };
    httpClient.postForm = async (url, formData, encoding) => {
      postedUrl = url;
      postedForm = formData;
      postedEncoding = encoding ?? '';
      return { content: sampleHtml, cookies: [], headers: {}, status: 200 };
    };

    const results = await provider.searchByTitle({ query: 'Тестовый Релиз' });

    assert.equal(results.length, 1);
    assert.equal(postedUrl, 'https://example.org/forum/tracker.php');
    assert.deepEqual(postedForm, { f: '-1', nm: 'Тестовый Релиз' });
    assert.equal(postedEncoding, 'windows-1251');
  });

  it('should scrape topic details when getTopicDetails is invoked', async () => {
    const httpClient = new HttpClient();
    const provider = new CardigannProvider(sampleDefinition, httpClient);

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

  it('should embed definition trackers into magnet URIs', async () => {
    const httpClient = new HttpClient();
    const definitionWithTrackers: CardigannDefinition = {
      ...sampleDefinition,
      trackers: [
        'http://tracker.example.org/announce',
        'udp://tracker.example.com:6969/announce',
      ],
    };
    const provider = new CardigannProvider(definitionWithTrackers, httpClient);

    (provider as unknown as { fetchWithFallback: () => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      return {
        baseUrl: 'https://example.org',
        content: sampleHtml,
        workingUrl: 'https://example.org',
      };
    };

    const results = await provider.searchByTitle({ query: 'Sample Release' });
    assert.equal(results.length, 1);
    const item = results[0];
    assert.ok(item.magnetUri);
    assert.match(item.magnetUri, /&tr=http%3A%2F%2Ftracker\.example\.org%2Fannounce/);
    assert.match(item.magnetUri, /&tr=udp%3A%2F%2Ftracker\.example\.com%3A6969%2Fannounce/);
  });

  it('should skip rows defined by rows.after', async () => {
    const httpClient = new HttpClient();
    const htmlWithHeader = `
      <table>
        <tr class="item-row"><th>Header</th></tr>
        <tr class="item-row"><td><a href="/torrent/1">Sample Release 1</a></td></tr>
        <tr class="item-row"><td><a href="/torrent/2">Sample Release 2</a></td></tr>
      </table>
    `;
    const definitionWithAfter: CardigannDefinition = {
      ...sampleDefinition,
      search: {
        ...sampleDefinition.search,
        fields: {
          details: {
            attribute: 'href',
            selector: 'a',
          },
          title: {
            selector: 'a',
          },
        },
        rows: {
          after: 1,
          selector: 'tr.item-row',
        },
      },
    };
    const provider = new CardigannProvider(definitionWithAfter, httpClient);
    (provider as unknown as { fetchWithFallback: () => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      return {
        baseUrl: 'https://example.org',
        content: htmlWithHeader,
        workingUrl: 'https://example.org',
      };
    };

    const results = await provider.searchByTitle({ query: 'Sample' });
    assert.equal(results.length, 2);
    assert.equal(results[0].name, 'Sample Release 1');
    assert.equal(results[1].name, 'Sample Release 2');
  });

  it('should resolve topicPath using declarative details.path template', async () => {
    const httpClient = new HttpClient();
    const definitionWithDetails: CardigannDefinition = {
      ...sampleDefinition,
      details: {
        path: 'custom/topic/{{ .Id }}',
      },
      search: {
        ...sampleDefinition.search,
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
      ...sampleDefinition,
      details: undefined,
      search: {
        ...sampleDefinition.search,
        fields: {
          ...sampleDefinition.search.fields,
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
        ...sampleDefinition,
        search: {
          ...sampleDefinition.search,
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
        ...sampleDefinition,
        search: {
          ...sampleDefinition.search,
          fields: {
            details: { attribute: 'href', selector: 'a[href^="viewtopic.php?t="]' },
            id: { text: 42 },
            title: { selector: 'a' },
          },
          paths: [{ path: '{{ if .Config.useforum }}forum/tracker.php{{ else }}tracker.php{{ end }}?page={{ .Query.Page }}&year={{ .Query.Year }}' }],
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
        `https://example.org/${directory}tracker.php?page=0&year=0`,
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
      ...sampleDefinition,
      links: ['https://primary.example/base/', 'https://secondary.example/base/'],
      search: {
        ...sampleDefinition.search,
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

  it('should preserve topic URLs from searches whose directory depends on keywords, year and page', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => {
      requestedUrls.push(url);
      return new URL(url).pathname.endsWith('/tracker.php')
        ? '<table class="results"><tr class="item-row"><td><a href="viewtopic.php?t=42&amp;ref=sample">Sample Topic</a></td></tr></table>'
        : '<h1>Sample Topic</h1>';
    };
    const provider = new CardigannProvider({
      ...sampleDefinition,
      search: {
        ...sampleDefinition.search,
        fields: {
          details: { attribute: 'href', selector: 'a[href^="viewtopic.php?t="]' },
          title: { selector: 'a' },
        },
        paths: [{ path: '{{ if .Keywords }}forum/{{ .Query.Year }}/{{ .Page }}/tracker.php{{ else }}tracker.php{{ end }}' }],
      },
    }, httpClient);

    const [result] = await provider.searchByTitle({ page: 2, query: 'Sample', year: 2024 });
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
      ...sampleDefinition,
      links: ['https://primary.example/base/', 'https://secondary.example/mirror/'],
      search: {
        ...sampleDefinition.search,
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
      return url.endsWith('/search') ? sampleHtml : '<h1>Sample Topic</h1>';
    };
    const provider = new CardigannProvider({
      ...sampleDefinition,
      details: { path: 'custom/topic/{{ .Id }}' },
      search: { ...sampleDefinition.search, paths: [{ path: '/search' }] },
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
      ...sampleDefinition,
      search: {
        ...sampleDefinition.search,
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
    const provider = new CardigannProvider(sampleDefinition, httpClient);
    (provider as unknown as { fetchWithFallback: () => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      throw new Error('Network failure');
    };

    const details = await provider.getTopicDetails('99999');
    assert.equal(details, null);
  });

  it('should apply keywordsfilters before building query inputs', async () => {
    const httpClient = new HttpClient();
    const definitionWithFilters: CardigannDefinition = {
      ...sampleDefinition,
      search: {
        ...sampleDefinition.search,
        inputs: {
          q: '{{ .Keywords }}',
        },
        keywordsfilters: [
          {
            args: ['(?i)S0?(\\d+)E0?(\\d+)', '$1 $2'],
            name: 're_replace',
          },
        ],
        paths: [
          {
            path: '/search',
          },
        ],
      },
    };
    const provider = new CardigannProvider(definitionWithFilters, httpClient);
    let requestedUrl = '';
    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedUrl = await builder('https://example.org');
      return {
        baseUrl: 'https://example.org',
        content: sampleHtml,
        workingUrl: requestedUrl,
      };
    };

    await provider.searchByTitle({ query: 'Sample Show S01E02' });
    assert.match(requestedUrl, /q=Sample\+Show\+1\+2/);
  });

  it('should populate context.Config from settings and render search headers templates', async () => {
    const httpClient = new HttpClient();
    const definitionWithSettings: CardigannDefinition = {
      ...sampleDefinition,
      search: {
        ...sampleDefinition.search,
        headers: {
          'X-Custom-Header': '{{ .Config.sitelink }}api',
          'X-Multi': ['{{ .Config.resolution }}', 'extra'],
          'X-Resolution': '{{ .Config.resolution }}',
        },
      },
      settings: [
        {
          default: '1080p',
          name: 'resolution',
          type: 'text',
        },
      ],
    };
    const provider = new CardigannProvider(definitionWithSettings, httpClient);
    let capturedHeaders: Record<string, string> | undefined;
    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>, options?: { headers?: Record<string, string> }) => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async (builder, options) => {
      await builder('https://example.org');
      capturedHeaders = options?.headers;
      return {
        baseUrl: 'https://example.org',
        content: sampleHtml,
        workingUrl: 'https://example.org',
      };
    };

    await provider.searchByTitle({ query: 'Sample' });
    assert.ok(capturedHeaders);
    assert.equal(capturedHeaders['X-Custom-Header'], 'https://example.org/api');
    assert.equal(capturedHeaders['X-Resolution'], '1080p');
    assert.equal(capturedHeaders['X-Multi'], '1080p, extra');
  });
});

describe('CardigannProvider time zones', () => {
  const zoneDefinition: CardigannDefinition = {
    id: 'zonetracker',
    links: ['https://tracker.example.org/'],
    name: 'Zone Tracker',
    search: {
      fields: {
        date: { selector: 'td.date' },
        title: { selector: 'td.title' },
      },
      paths: [{ path: 'search' }],
      rows: { selector: 'tr.row' },
    },
  };

  const zoneHtml = '<table><tr class="row"><td class="title">Example Release 2026</td><td class="date">15.08.2024 12:30</td></tr></table>';

  it('should read row times in Moscow time by default', async () => {
    const httpClient = new HttpClient();
    httpClient.getDecoded = async () => zoneHtml;
    const provider = new CardigannProvider(zoneDefinition, httpClient);

    assert.equal(provider.timeZone, 'Europe/Moscow');
    const [item] = await provider.searchByTitle({ query: 'example' });
    assert.equal(item.date, '2024-08-15T09:30:00.000Z');
  });

  it('should use the global prefixed time zone with per-tracker overrides', () => {
    const originalEnv = { ...process.env };
    process.env.TORRGATE_TRACKER_TIMEZONE = 'Asia/Tokyo';
    try {
      assert.equal(new CardigannProvider(zoneDefinition, new HttpClient()).timeZone, 'Asia/Tokyo');
      process.env.TORRGATE_ZONETRACKER_TIMEZONE = 'Europe/London';
      assert.equal(new CardigannProvider(zoneDefinition, new HttpClient()).timeZone, 'Europe/London');
    } finally {
      process.env = originalEnv;
    }
  });

  it('should honour a per-tracker time zone and ignore invalid names', () => {
    process.env.TORRGATE_ZONETRACKER_TIMEZONE = 'Asia/Tokyo';
    try {
      assert.equal(new CardigannProvider(zoneDefinition, new HttpClient()).timeZone, 'Asia/Tokyo');
      process.env.TORRGATE_ZONETRACKER_TIMEZONE = 'Not/A_Zone';
      assert.equal(new CardigannProvider(zoneDefinition, new HttpClient()).timeZone, 'Europe/Moscow');
    } finally {
      delete process.env.TORRGATE_ZONETRACKER_TIMEZONE;
    }
  });
});

describe('CardigannProvider shared topic paths', () => {
  const definition: CardigannDefinition = {
    id: 'sampleforum',
    links: ['https://tracker.example/'],
    name: 'Sample Forum',
    search: {
      fields: {
        details: { attribute: 'href', selector: 'a[href^="viewtopic.php?t="]' },
        id: { text: 42 },
        title: { selector: 'a' },
      },
      paths: [{ path: '{{ if .Keywords }}forum/tracker.php{{ else }}tracker.php{{ end }}' }],
      rows: { selector: 'tr.item-row' },
    },
  };

  beforeEach(() => {
    mock.timers.enable({ apis: ['Date'], now: 1_000 });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  function createProvider(providerDefinition = definition): CardigannProvider {
    const httpClient = new HttpClient();
    httpClient.getDecoded = async url => new URL(url).pathname.endsWith('/tracker.php')
      ? '<table><tr class="item-row"><td><a href="viewtopic.php?t=42">Sample Topic</a></td></tr></table>'
      : '<h1>Sample Topic</h1>';
    return new CardigannProvider(providerDefinition, httpClient);
  }

  it('should await shared storage and preserve paths throughout the configured search cache lifetime', async () => {
    const store = new MemoryCache<unknown>(300);
    const sharedStore = getTopicPathStore(store);
    const setMany = sharedStore.setMany.bind(sharedStore);
    const writes = mock.method(sharedStore, 'setMany', async (entries: readonly CacheWrite[], ttlSeconds?: number) => {
      await Promise.resolve();
      await setMany(entries, ttlSeconds);
    });
    const first = createProvider();
    first.shareTopicPaths(store, 'sample-namespace', 1_800);
    const [item] = await first.searchByTitle({ query: 'Sample' });
    assert.equal(writes.mock.callCount(), 1);

    const second = createProvider();
    second.shareTopicPaths(store, 'sample-namespace', 1_800);
    assert.equal((await second.getTopicDetails(item.id))?.url, item.url);

    mock.timers.tick(1_800_000);
    const third = createProvider();
    third.shareTopicPaths(store, 'sample-namespace', 1_800);
    assert.equal((await third.getTopicDetails(item.id))?.url, item.url);
  });

  it('should isolate paths by deployment namespace and definition', async () => {
    const cache = new MemoryCache<unknown>(300);
    const first = createProvider();
    first.shareTopicPaths(cache, 'first-namespace', 300);
    await first.searchByTitle({ query: 'Sample' });

    const otherNamespace = createProvider();
    otherNamespace.shareTopicPaths(cache, 'second-namespace', 300);
    assert.equal((await otherNamespace.getTopicDetails('42'))?.url, 'https://tracker.example/viewtopic.php?t=42');

    const otherDefinition = createProvider({
      ...definition,
      search: { ...definition.search, paths: [{ path: 'other/tracker.php' }] },
    });
    otherDefinition.shareTopicPaths(cache, 'first-namespace', 300);
    assert.equal((await otherDefinition.getTopicDetails('42'))?.url, 'https://tracker.example/other/viewtopic.php?t=42');
  });

  it('should identify cached paths for mirrors sharing a hostname with different schemes', async () => {
    const cache = new MemoryCache<unknown>(300);
    const httpClient = new HttpClient();
    httpClient.getDecoded = async url => {
      if (url.startsWith('http:')) throw new Error('Sample mirror unavailable');
      return '<table><tr class="item-row"><td><a href="viewtopic.php?t=42">Sample Topic</a></td></tr></table>';
    };
    const provider = new CardigannProvider({
      ...definition,
      links: ['http://tracker.example/', 'https://tracker.example/'],
    }, httpClient);
    provider.shareTopicPaths(cache, 'sample-namespace', 300);
    const [item] = await provider.searchByTitle({ query: 'Sample' });

    const entry = provider.getTopicPathCacheEntry(item);
    assert.ok(entry);
    assert.equal(getTopicPathStore(cache).get(entry.key), './forum/viewtopic.php?t=42');
  });
});

describe('CardigannProvider request delay', () => {
  const delayedDefinition: CardigannDefinition = {
    id: 'delayedtracker',
    links: ['https://tracker.example.org/'],
    name: 'Delayed Tracker',
    requestDelay: 2,
    search: {
      fields: { title: { selector: 'td.title' } },
      paths: [{ path: 'search' }],
      rows: { selector: 'tr.row' },
    },
  };

  const settle = async (): Promise<void> => {
    for (let round = 0; round < 10; round++) {
      await new Promise(resolve => setImmediate(resolve));
    }
  };

  const recordRequestTimes = (httpClient: HttpClient): number[] => {
    const requestTimes: number[] = [];
    httpClient.getDecoded = async () => {
      requestTimes.push(Date.now());
      return '<table><tr class="row"><td class="title">Example Release</td></tr></table>';
    };
    return requestTimes;
  };

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000 });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it('should space concurrent searches by the definition requestDelay', async () => {
    const httpClient = new HttpClient();
    const requestTimes = recordRequestTimes(httpClient);
    const provider = new CardigannProvider(delayedDefinition, httpClient);

    const searches = Promise.all([provider.searchByTitle({ query: 'one' }), provider.searchByTitle({ query: 'two' })]);
    await settle();
    assert.deepEqual(requestTimes, [1_000]);
    mock.timers.tick(2_000);
    await searches;

    assert.deepEqual(requestTimes, [1_000, 3_000]);
  });

  it('should not delay requests when requestDelay is absent', async () => {
    const httpClient = new HttpClient();
    const requestTimes = recordRequestTimes(httpClient);
    const provider = new CardigannProvider({ ...delayedDefinition, requestDelay: undefined }, httpClient);

    await Promise.all([provider.searchByTitle({ query: 'one' }), provider.searchByTitle({ query: 'two' })]);

    assert.deepEqual(requestTimes, [1_000, 1_000]);
  });

  it('should claim a shared request slot per tracker once the registry shares request delays', async () => {
    const httpClient = new HttpClient();
    recordRequestTimes(httpClient);
    const registry = new ProviderRegistry(httpClient);
    const claimedKeys: string[] = [];
    registry.shareRequestDelays({
      claimSlot: async (key: string) => {
        claimedKeys.push(key);
        return 0;
      },
    });

    await registry.getProvider('newstudio')?.searchByTitle({ query: 'sample' });
    await registry.getProvider('rutor')?.searchByTitle({ query: 'sample' });

    assert.deepEqual(claimedKeys, ['request-slot:newstudio']);
  });
});
