// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { HttpClient } from '../../../src/http/http-client.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';
import { testCardigannDefinition, testCardigannHtml } from '../../fixtures/cardigann.fixture.js';

describe('CardigannProvider availability', () => {
  for (const isAvailable of [true, false]) {
    it(`should report ${isAvailable ? 'available' : 'unavailable'} when the tracker ${isAvailable ? 'responds' : 'fails'}`, async () => {
      const httpClient = new HttpClient();
      httpClient.getDecoded = async () => {
        if (!isAvailable) throw new Error('Sample tracker unavailable');
        return testCardigannHtml;
      };
      const provider = new CardigannProvider(testCardigannDefinition, httpClient);

      assert.deepEqual(await provider.checkAvailability(), { isAvailable, name: testCardigannDefinition.name });
    });
  }
});

describe('CardigannProvider search execution', () => {
  it('should parse search results from synthetic HTML fixture', async () => {
    const httpClient = new HttpClient();
    const provider = new CardigannProvider(testCardigannDefinition, httpClient);

    // Override fetchWithFallback to return our synthetic HTML
    (provider as unknown as { fetchWithFallback: () => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      return {
        baseUrl: 'https://example.org',
        content: testCardigannHtml,
        workingUrl: 'https://example.org',
      };
    };

    const results = await provider.searchByTitle({ query: 'Sample Release' });

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
      ...testCardigannDefinition,
      search: {
        ...testCardigannDefinition.search,
        paths: [{ path: '/search?format={{ .Query.Format }}' }],
      },
    };
    const provider = new CardigannProvider(formatDefinition, httpClient);
    const formatHtml = testCardigannHtml.replace('(2024) BDRip', '(2024) 1080p BDRip');
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

  it('should percent-encode music and book values in search paths', async () => {
    const httpClient = new HttpClient();
    const requestedUrls: string[] = [];
    httpClient.getDecoded = async url => { requestedUrls.push(url); return '<table></table>'; };
    const provider = new CardigannProvider({
      links: ['https://tracker.example/'],
      name: 'Sample Tracker',
      search: {
        fields: { title: { selector: 'a' } },
        paths: [{
          path: '{{ .Query.Album }}/{{ .Query.Artist }}/{{ .Query.Label }}/{{ .Query.Track }}/' +
              '{{ .Query.Genre }}/{{ .Query.Title }}/{{ .Query.Author }}',
        }],
        rows: { selector: 'tr' },
      },
    }, httpClient);
    const sampleValue = '../admin?x#';
    await provider.searchByTitle({
      album: sampleValue,
      artist: sampleValue,
      author: sampleValue,
      genre: sampleValue,
      label: sampleValue,
      query: '',
      title: sampleValue,
      track: sampleValue,
    });
    assert.deepEqual(requestedUrls, [`https://tracker.example/${Array(7).fill('..%2Fadmin%3Fx%23').join('/')}`]);
  });

  it('should expose the requested season and episode to search templates, percent-encoded in paths', async () => {
    const httpClient = new HttpClient();
    const episodeDefinition: CardigannDefinition = {
      ...testCardigannDefinition,
      search: {
        ...testCardigannDefinition.search,
        paths: [{ path: '/search?season={{ .Query.Season }}&ep={{ .Query.Ep }}&episode={{ .Query.Episode }}&q={{ .Keywords }}' }],
      },
    };
    const provider = new CardigannProvider(episodeDefinition, httpClient);
    const requestedUrls: string[] = [];

    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedUrls.push(await builder('https://example.org'));
      return { baseUrl: 'https://example.org', content: testCardigannHtml, workingUrl: 'https://example.org' };
    };

    await provider.searchByTitle({ episode: '2', query: 'Sample Show', season: 1 });
    await provider.searchByTitle({ episode: '10/21', query: 'Sample Show', season: 2024 });
    await provider.searchByTitle({ episode: '2', query: 'Sample Show', season: 0 });
    await provider.searchByTitle({ episode: '../admin?x#', query: 'Sample Show', season: 1 });

    assert.deepEqual(requestedUrls, [
      'https://example.org/search?season=1&ep=2&episode=S01E02&q=Sample%20Show%20S01E02',
      'https://example.org/search?season=2024&ep=10%2F21&episode=2024.10.21&q=Sample%20Show%202024.10.21',
      'https://example.org/search?season=&ep=2&episode=&q=Sample%20Show',
      'https://example.org/search?season=1&ep=..%2Fadmin%3Fx%23&episode=S01E..%2Fadmin%3Fx%23&q=Sample%20Show%20S01E..%2Fadmin%3Fx%23',
    ]);
  });

  it('should build Jackett search term and keyword variables from the query, year and episode tag', async () => {
    const httpClient = new HttpClient();
    const keywordsDefinition: CardigannDefinition = {
      ...testCardigannDefinition,
      search: {
        ...testCardigannDefinition.search,
        keywordsfilters: [
          { args: ['Sample Show', 'Тестовый Релиз'], name: 're_replace' },
          { args: '{{ if .Query.Q }}{{ else }} {{ .Today.Year }}{{ end }}', name: 'append' },
        ],
        paths: [{ path: '/search?q={{ .Query.Q }}&query={{ .Query.Keywords }}&keywords={{ .Keywords }}&legacy={{ .Query.Query }}' }],
      },
    };
    const provider = new CardigannProvider(keywordsDefinition, httpClient);
    const requestedUrls: string[] = [];

    (provider as unknown as { fetchWithFallback: (builder: (baseUrl: string) => Promise<string>) => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async builder => {
      requestedUrls.push(await builder('https://example.org'));
      return { baseUrl: 'https://example.org', content: testCardigannHtml, workingUrl: 'https://example.org' };
    };

    mock.timers.enable({ apis: ['Date'], now: new Date(2026, 5, 15) });
    try {
      await provider.searchByTitle({ episode: '2', query: 'Sample Show', season: 1, year: 2024 });
      await provider.searchByTitle({ query: 'Sample/Show?x#' });
      await provider.searchByTitle({ query: '', season: 1 });
      mock.timers.setTime(new Date(2027, 0, 15).getTime());
      await provider.searchByTitle({ query: '', season: 1 });
    } finally {
      mock.timers.reset();
    }

    const encodedTitle = encodeURIComponent('Тестовый Релиз');
    assert.deepEqual(requestedUrls, [
      `https://example.org/search?q=Sample%20Show&query=Sample%20Show%202024%20S01E02&keywords=${encodedTitle}%202024%20S01E02&legacy=${encodedTitle}%202024%20S01E02`,
      'https://example.org/search?q=Sample%2FShow%3Fx%23&query=Sample%2FShow%3Fx%23&keywords=Sample%2FShow%3Fx%23&legacy=Sample%2FShow%3Fx%23',
      'https://example.org/search?q=&query=S01&keywords=S01%202026&legacy=S01%202026',
      'https://example.org/search?q=&query=S01&keywords=S01%202026&legacy=S01%202026',
    ]);
  });

  it('should fall back to secondary mirror when urlBuilder fails on primary mirror', async () => {
    const httpClient = new HttpClient();
    const multiMirrorDef: CardigannDefinition = {
      ...testCardigannDefinition,
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
      return testCardigannHtml;
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
      ...testCardigannDefinition,
      encoding: 'windows-1251',
      search: {
        ...testCardigannDefinition.search,
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
      postedForm = formData instanceof URLSearchParams ? Object.fromEntries(formData) : formData;
      postedEncoding = encoding ?? '';
      return { content: testCardigannHtml, cookies: [], headers: {}, status: 200 };
    };

    const results = await provider.searchByTitle({ query: 'Тестовый Релиз' });

    assert.equal(results.length, 1);
    assert.equal(postedUrl, 'https://example.org/forum/tracker.php');
    assert.deepEqual(postedForm, { f: '-1', nm: 'Тестовый Релиз' });
    assert.equal(postedEncoding, 'windows-1251');
  });

  it('should embed definition trackers into magnet URIs', async () => {
    const httpClient = new HttpClient();
    const definitionWithTrackers: CardigannDefinition = {
      ...testCardigannDefinition,
      trackers: [
        'http://tracker.example.org/announce',
        'udp://tracker.example.com:6969/announce',
      ],
    };
    const provider = new CardigannProvider(definitionWithTrackers, httpClient);

    (provider as unknown as { fetchWithFallback: () => Promise<{ baseUrl: string; content: string; workingUrl: string }> }).fetchWithFallback = async () => {
      return {
        baseUrl: 'https://example.org',
        content: testCardigannHtml,
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
      ...testCardigannDefinition,
      search: {
        ...testCardigannDefinition.search,
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

  it('should apply keywordsfilters before building query inputs', async () => {
    const httpClient = new HttpClient();
    const definitionWithFilters: CardigannDefinition = {
      ...testCardigannDefinition,
      search: {
        ...testCardigannDefinition.search,
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
        content: testCardigannHtml,
        workingUrl: requestedUrl,
      };
    };

    await provider.searchByTitle({ query: 'Sample Show S01E02' });
    assert.match(requestedUrl, /q=Sample\+Show\+1\+2/);
  });

  it('should populate context.Config from settings and render search headers templates', async () => {
    const httpClient = new HttpClient();
    const definitionWithSettings: CardigannDefinition = {
      ...testCardigannDefinition,
      search: {
        ...testCardigannDefinition.search,
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
        content: testCardigannHtml,
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
