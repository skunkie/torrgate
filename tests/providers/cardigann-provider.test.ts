// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { CardigannProvider } from '../../src/providers/cardigann-provider.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { CardigannDefinition } from '../../src/providers/types.js';

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
    (provider as unknown as { fetchWithFallback: () => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      return {
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

    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedUrl = await builder('https://example.org');
      return {
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

    (provider as unknown as { fetchWithFallback: () => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async () => ({
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

    (provider as unknown as { fetchWithFallback: () => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      return {
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
    (provider as unknown as { fetchWithFallback: () => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      return {
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
    };
    const provider = new CardigannProvider(definitionWithDetails, httpClient);

    let requestedPath = '';
    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedPath = await builder('https://example.org');
      return {
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
    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedPath = await builder('https://example.org');
      return {
        content: '<title>Sample Title</title><h1>Sample Topic</h1>',
        workingUrl: 'https://example.org',
      };
    };

    const details = await provider.getTopicDetails('888456');
    assert.ok(details);
    assert.equal(requestedPath, 'https://example.org/forum/viewtopic.php?t=888456');
  });

  it('should safely return null and log warning when getTopicDetails throws', async () => {
    const httpClient = new HttpClient();
    const provider = new CardigannProvider(sampleDefinition, httpClient);
    (provider as unknown as { fetchWithFallback: () => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async () => {
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
    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedUrl = await builder('https://example.org');
      return {
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
    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>, options?: { headers?: Record<string, string> }) => Promise<{ content: string; workingUrl: string }> }).fetchWithFallback = async (builder, options) => {
      await builder('https://example.org');
      capturedHeaders = options?.headers;
      return {
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
