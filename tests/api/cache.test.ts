// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { MemoryCache } from '../../src/cache/memory-cache.js';
import { getTopicPathStore } from '../../src/cache/topic-path-cache.js';
import { UpstashRedisCache } from '../../src/cache/upstash-cache.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { CardigannProvider } from '../../src/providers/cardigann-provider.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { CardigannDefinition } from '../../src/providers/types.js';
import { ApiErrorResponse } from '../../src/types/api.js';
import { JackettSearchResponse } from '../../src/types/jackett.js';
import { TopicDetails, TorrentItem } from '../../src/types/torrent.js';

interface TestHttpResponse {
  body: string;
  cacheStatus?: string;
  status: number;
}

function requestWithHost(url: string, host: string): Promise<TestHttpResponse> {
  const requestUrl = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        headers: { Host: host },
        hostname: requestUrl.hostname,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        port: requestUrl.port,
      },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          const cacheHeader = response.headers['x-cache'];
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            cacheStatus: Array.isArray(cacheHeader) ? cacheHeader[0] : cacheHeader,
            status: response.statusCode ?? 0,
          });
        });
      }
    );
    request.on('error', reject);
  });
}

describe('Shared topic paths', () => {
  for (const route of [
    'sampleforum/results?Query=',
    'all/results?Query=',
    'all/results?Offset=0&Limit=600&Query=',
    'sampleforum/results/torznab/api?t=search&limit=600&q=',
    'all/results/torznab/api?t=search&limit=600&q=',
  ]) {
    it(`should restore ${route} topic paths from cached responses`, async () => {
      const sharedCache = new MemoryCache<unknown>(300);
      const definition: CardigannDefinition = {
        id: 'sampleforum',
        links: ['https://tracker.example/'],
        name: 'Sample Forum',
        search: {
          fields: {
            details: { attribute: 'href', selector: 'a[href^="viewtopic.php?t="]' },
            title: { selector: 'a' },
          },
          paths: [{ path: '{{ .Keywords }}/tracker.php' }],
          rows: { selector: 'tr.item-row' },
        },
      };
      const testServers: http.Server[] = [];
      const baseUrls: string[] = [];
      const requestedUrls: string[] = [];
      try {
        for (let instance = 0; instance < 3; instance++) {
          const httpClient = new HttpClient();
          httpClient.getDecoded = async url => {
            requestedUrls.push(url);
            const pathname = new URL(url).pathname;
            if (pathname.endsWith('/tracker.php')) {
              const firstId = pathname === '/First/tracker.php' ? 1 : 601;
              const rows = Array.from({ length: 600 }, (_, offset) =>
                `<tr class="item-row"><td><a href="viewtopic.php?t=${firstId + offset}">Sample Topic ${firstId + offset}</a></td></tr>`
              ).join('');
              return `<table>${rows}</table>`;
            }
            return pathname === '/First/viewtopic.php' ? '<h1>Sample Topic</h1>' : '';
          };
          const registry = new ProviderRegistry(httpClient, 'tests/fixtures');
          registry.registerProvider(new CardigannProvider(definition, httpClient));
          const testServer = http.createServer(createApp(registry, { cache: sharedCache }));
          testServers.push(testServer);
          await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
          const port = (testServer.address() as { port: number }).port;
          baseUrls.push(`http://127.0.0.1:${port}/api/v2.0/indexers`);
        }

        const search = async (instance: number, query: string) => requestWithHost(`${baseUrls[instance]}/${route}${query}`, 'shared.example');
        assert.equal((await search(0, 'First')).cacheStatus, 'MISS');
        assert.equal((await search(0, 'Second')).cacheStatus, 'MISS');
        await getTopicPathStore(sharedCache).clear();
        const refreshed = await search(1, 'First');
        assert.equal(refreshed.status, 200);
        assert.equal(refreshed.cacheStatus, 'HIT');
        assert.deepEqual(requestedUrls, [
          'https://tracker.example/First/tracker.php',
          'https://tracker.example/Second/tracker.php',
        ]);
        assert.equal((await search(1, 'First')).cacheStatus, 'HIT');

        const details = await requestWithHost(`${baseUrls[2]}/sampleforum/details/1`, 'shared.example');
        assert.equal(details.status, 200);
        assert.equal((JSON.parse(details.body) as TopicDetails[])[0].url, 'https://tracker.example/First/viewtopic.php?t=1');
      } finally {
        await Promise.all(testServers.map(testServer => new Promise<void>(resolve => testServer.close(() => resolve()))));
      }
    });
  }

  for (const endpoint of [
    'results?Query=Sample',
    'results/torznab/api?t=search&q=Sample',
  ]) {
    it(`should resolve details on another instance after a cached ${endpoint} request`, async () => {
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
      const sharedCache = new MemoryCache<unknown>(300);
      const testServers: http.Server[] = [];
      const requestsByInstance: string[][] = [];
      const baseUrls: string[] = [];
      try {
        for (let instance = 0; instance < 2; instance++) {
          const httpClient = new HttpClient();
          const requestedUrls: string[] = [];
          requestsByInstance.push(requestedUrls);
          httpClient.getDecoded = async url => {
            requestedUrls.push(url);
            if (new URL(url).pathname === '/forum/tracker.php') {
              return '<table><tr class="item-row"><td><a href="viewtopic.php?t=42&amp;ref=sample">Sample Topic</a></td></tr></table>';
            }
            return new URL(url).pathname === '/forum/viewtopic.php' ? '<h1>Sample Topic</h1>' : '';
          };
          const registry = new ProviderRegistry(httpClient);
          registry.registerProvider(new CardigannProvider(definition, httpClient));
          const testServer = http.createServer(createApp(registry, {
            apiKey: 'sample-key',
            cache: sharedCache,
          }));
          testServers.push(testServer);
          await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
          const port = (testServer.address() as { port: number }).port;
          baseUrls.push(`http://127.0.0.1:${port}/api/v2.0/indexers/sampleforum`);
        }

        const first = await requestWithHost(`${baseUrls[0]}/${endpoint}&apikey=sample-key`, 'shared.example');
        assert.equal(first.status, 200);
        assert.equal(first.cacheStatus, 'MISS');
        const second = await requestWithHost(`${baseUrls[1]}/${endpoint}&apikey=sample-key`, 'shared.example');
        assert.equal(second.status, 200);
        assert.equal(second.cacheStatus, 'HIT');
        assert.equal(second.body, first.body);
        assert.deepEqual(requestsByInstance[1], []);

        const details = await requestWithHost(`${baseUrls[1]}/details/42?apikey=sample-key`, 'shared.example');
        assert.equal(details.status, 200);
        assert.equal(details.cacheStatus, 'MISS');
        const expectedUrl = 'https://tracker.example/forum/viewtopic.php?t=42&ref=sample';
        assert.equal((JSON.parse(details.body) as TopicDetails[])[0].url, expectedUrl);
        assert.deepEqual(requestsByInstance[1], [expectedUrl]);
      } finally {
        await Promise.all(testServers.map(testServer => new Promise<void>(resolve => testServer.close(() => resolve()))));
      }
    });
  }
});

describe('Search cache capacity and Redis commands', () => {
  const definition: CardigannDefinition = {
    id: 'sampleforum',
    links: ['https://tracker.example/'],
    name: 'Sample Forum',
    search: {
      fields: {
        details: { attribute: 'href', selector: 'a' },
        title: { selector: 'a' },
      },
      paths: [{ path: '{{ .Keywords }}/tracker.php' }],
      rows: { selector: 'tr.item-row' },
    },
  };

  function createRegistry(resultCount: number, providerId = 'sampleforum'): ProviderRegistry {
    const httpClient = new HttpClient();
    httpClient.getDecoded = async url => {
      if (!new URL(url).pathname.endsWith('/tracker.php')) return '<h1>Sample Topic</h1>';
      const queryId = Number(new URL(url).pathname.match(/Sample(\d+)/)?.[1] ?? 0);
      const rows = Array.from({ length: resultCount }, (_, index) =>
        `<tr class="item-row"><td><a href="viewtopic.php?t=${queryId * resultCount + index}">Sample Topic ${index}</a></td></tr>`
      ).join('');
      return `<table>${rows}</table>`;
    };
    const registry = new ProviderRegistry(httpClient, 'tests/fixtures');
    registry.registerProvider(new CardigannProvider({ ...definition, id: providerId }, httpClient));
    return registry;
  }

  for (const providerId of ['constructor', '__proto__']) {
    for (const route of ['results?Query=Sample', 'results/torznab/api?t=search&q=Sample']) {
      it(`should cache ${route} and resolve details for provider ${providerId}`, async () => {
        const cache = new MemoryCache<unknown>();
        const testServer = http.createServer(createApp(createRegistry(1, providerId), { cache }));
        await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
        const port = (testServer.address() as { port: number }).port;
        const baseUrl = `http://127.0.0.1:${port}/api/v2.0/indexers/${providerId}`;
        try {
          const first = await requestWithHost(`${baseUrl}/${route}`, 'shared.example');
          assert.equal(first.status, 200);
          assert.equal(first.cacheStatus, 'MISS');
          const second = await requestWithHost(`${baseUrl}/${route}`, 'shared.example');
          assert.equal(second.status, 200);
          assert.equal(second.cacheStatus, 'HIT');
          assert.equal(second.body, first.body);
          const details = await requestWithHost(`${baseUrl}/details/0`, 'shared.example');
          assert.equal(details.status, 200);
          assert.equal((JSON.parse(details.body) as TopicDetails[])[0].url, 'https://tracker.example/Sample/viewtopic.php?t=0');
        } finally {
          await new Promise<void>(resolve => testServer.close(() => resolve()));
        }
      });
    }
  }

  it('should retain 500 searches with distinct topic paths within the byte budget', async () => {
    const cache = new MemoryCache<unknown>(300);
    const testServer = http.createServer(createApp(createRegistry(50), { cache }));
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    const port = (testServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}/api/v2.0/indexers/sampleforum/results?Query=Sample`;
    try {
      for (let index = 0; index < 500; index++) {
        const response = await requestWithHost(`${baseUrl}${index}`, 'shared.example');
        assert.equal(response.status, 200);
        assert.equal(response.cacheStatus, 'MISS');
      }
      assert.equal(cache.size, 500);
      assert.equal((await requestWithHost(`${baseUrl}0`, 'shared.example')).cacheStatus, 'HIT');
      assert.equal((await requestWithHost(`${baseUrl}499`, 'shared.example')).cacheStatus, 'HIT');
      assert.equal((await requestWithHost(`${baseUrl}500`, 'shared.example')).cacheStatus, 'MISS');
      assert.equal(cache.size, 500);
      assert.equal((await requestWithHost(`${baseUrl}1`, 'shared.example')).cacheStatus, 'MISS');
    } finally {
      await new Promise<void>(resolve => testServer.close(() => resolve()));
    }
  });

  for (const route of ['results?Query=Sample', 'results/torznab/api?t=search&limit=600&q=Sample']) {
    it(`should use constant Redis commands and restore paths across instances for ${route}`, async () => {
      const values = new Map<string, string>();
      const fields = new Map<string, string>();
      const commands: (number | string)[][] = [];
      const testRedisServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const command = JSON.parse(body) as (number | string)[];
          commands.push(command);
          let result: unknown = null;
          const key = String(command[1]);
          if (command[0] === 'GET') result = values.get(key) ?? null;
          if (command[0] === 'SET') {
            values.set(key, String(command[2]));
            result = 'OK';
          }
          if (command[0] === 'HGET') result = fields.get(String(command[2])) ?? null;
          if (command[0] === 'HSETEX') {
            for (let index = 6; index < command.length; index += 2) {
              fields.set(String(command[index]), String(command[index + 1]));
            }
            result = 1;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        });
      });
      await new Promise<void>(resolve => testRedisServer.listen(0, '127.0.0.1', resolve));
      const redisPort = (testRedisServer.address() as { port: number }).port;
      const testServers: http.Server[] = [];
      const baseUrls: string[] = [];
      try {
        for (let instance = 0; instance < 3; instance++) {
          const cache = new UpstashRedisCache(`http://127.0.0.1:${redisPort}`, 'sample-token');
          const testServer = http.createServer(createApp(createRegistry(600), { cache }));
          testServers.push(testServer);
          await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
          const port = (testServer.address() as { port: number }).port;
          baseUrls.push(`http://127.0.0.1:${port}/api/v2.0/indexers/sampleforum`);
        }
        const first = await requestWithHost(`${baseUrls[0]}/${route}`, 'shared.example');
        assert.equal(first.status, 200);
        assert.equal(first.cacheStatus, 'MISS');
        assert.deepEqual(commands.map(command => command[0]), ['GET', 'HSETEX', 'SET']);
        assert.equal(commands[1][5], 600);

        commands.length = 0;
        const directDetails = await requestWithHost(`${baseUrls[2]}/details/0`, 'shared.example');
        assert.equal(directDetails.status, 200);
        assert.equal((JSON.parse(directDetails.body) as TopicDetails[])[0].url, 'https://tracker.example/Sample/viewtopic.php?t=0');
        assert.deepEqual(commands.map(command => command[0]), ['GET', 'HGET', 'SET']);

        fields.clear();
        commands.length = 0;
        const second = await requestWithHost(`${baseUrls[1]}/${route}`, 'shared.example');
        assert.equal(second.cacheStatus, 'HIT');
        assert.equal(second.body, first.body);
        assert.deepEqual(commands.map(command => command[0]), ['GET', 'HSETEX']);
        assert.equal(commands[1][5], 600);
        commands.length = 0;
        const details = await requestWithHost(`${baseUrls[2]}/details/1`, 'shared.example');
        assert.equal(details.status, 200);
        assert.equal((JSON.parse(details.body) as TopicDetails[])[0].url, 'https://tracker.example/Sample/viewtopic.php?t=1');
        assert.deepEqual(commands.map(command => command[0]), ['GET', 'HGET', 'SET']);
      } finally {
        await Promise.all([...testServers, testRedisServer].map(server =>
          new Promise<void>(resolve => server.close(() => resolve()))
        ));
      }
    });
  }
});

describe('API Search and RSS Caching Integration', () => {
  let baseUrl: string;
  let cache: MemoryCache<unknown>;
  let searchCallCount = 0;
  let server: http.Server;
  let topicCallCount = 0;

  const sampleItem: TorrentItem = {
    category: 'Video',
    date: '2026-09-20',
    downloadCount: 42,
    id: '12345',
    leechers: 2,
    magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
    name: 'Sample Release Item',
    seeders: 10,
    size: '1.2 GB',
    sizeBytes: 1288490188,
    torrentUrl: 'https://example.org/download/12345',
    url: 'https://example.org/details/12345',
  };

  const sampleDetails: TopicDetails = {
    actors: ['Sample Actor'],
    audioTranslation: 'Sample Audio',
    category: 'Video',
    description: 'Sample Description',
    director: 'Sample Director',
    duration: '120 min',
    id: '12345',
    imdbUrl: 'https://example.org/imdb',
    infoHash: '0123456789abcdef0123456789abcdef01234567',
    kinopoiskUrl: 'https://example.org/kinopoisk',
    magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
    name: 'Sample Release Item',
    posterUrl: 'https://example.org/poster.jpg',
    releaseCountry: 'Sample Country',
    torrentUrl: 'https://example.org/download/12345',
    url: 'https://example.org/details/12345',
    year: '2026',
  };

  before(async () => {
    const httpClient = new HttpClient();
    const registry = new ProviderRegistry(httpClient);
    const rutorProvider = registry.getProvider('rutor');

    if (rutorProvider) {
      rutorProvider.searchByTitle = async () => {
        searchCallCount++;
        return [sampleItem];
      };
      rutorProvider.searchPageByTitle = undefined;
      rutorProvider.getTopicDetails = async () => {
        topicCallCount++;
        return sampleDetails;
      };
    }

    cache = new MemoryCache<unknown>(300);
    const app = createApp(registry, {
      cache,
      cacheTtlSeconds: 300,
    });

    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  });

  it('should cache search results and serve second request from cache', async () => {
    // 1. Initial request (Cache Miss)
    const resFirst = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=SampleRelease`);
    assert.equal(resFirst.status, 200);
    assert.equal(resFirst.headers.get('x-cache'), 'MISS');
    assert.ok(resFirst.headers.get('cache-control')?.includes('s-maxage=300'));
    const bodyFirst = (await resFirst.json()) as JackettSearchResponse;
    assert.equal(bodyFirst.Results.length, 1);
    assert.equal(searchCallCount, 1);

    // 2. Subsequent identical request (Cache Hit)
    const resSecond = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=SampleRelease`);
    assert.equal(resSecond.status, 200);
    assert.equal(resSecond.headers.get('x-cache'), 'HIT');
    assert.ok(resSecond.headers.get('cache-control')?.includes('s-maxage=300'));
    const bodySecond = (await resSecond.json()) as JackettSearchResponse;
    assert.equal(bodySecond.Results.length, 1);
    assert.equal(searchCallCount, 1); // Provider method was NOT called again
  });

  it('should partition cached search results by response origin', async () => {
    const url = `${baseUrl}/api/v2.0/indexers/rutor/results?Query=SampleOriginSearch`;
    const first = await requestWithHost(url, 'first.example');
    assert.equal(first.cacheStatus, 'MISS');
    assert.equal(first.status, 200);
    const firstBody = JSON.parse(first.body) as JackettSearchResponse;
    assert.match(firstBody.Results[0]?.Link ?? '', /^http:\/\/first\.example\//);

    const second = await requestWithHost(url, 'second.example');
    assert.equal(second.cacheStatus, 'MISS');
    const secondBody = JSON.parse(second.body) as JackettSearchResponse;
    assert.match(secondBody.Results[0]?.Link ?? '', /^http:\/\/second\.example\//);

    const repeated = await requestWithHost(url, 'second.example');
    assert.equal(repeated.cacheStatus, 'HIT');
  });

  it('should cache topic details and serve second request from cache', async () => {
    // 1. Initial request (Cache Miss)
    const resFirst = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/details/12345`);
    assert.equal(resFirst.status, 200);
    assert.equal(resFirst.headers.get('x-cache'), 'MISS');
    assert.equal(topicCallCount, 1);

    // 2. Subsequent identical request (Cache Hit)
    const resSecond = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/details/12345`);
    assert.equal(resSecond.status, 200);
    assert.equal(resSecond.headers.get('x-cache'), 'HIT');
    assert.equal(topicCallCount, 1);
  });

  it('should return 404 for a removed indexer even when its topic details remain cached', async () => {
    const sharedCache = new MemoryCache<unknown>(300);
    const testServers: http.Server[] = [];
    const baseUrls: string[] = [];
    try {
      const populatedRegistry = new ProviderRegistry(new HttpClient());
      const provider = populatedRegistry.getProvider('rutor');
      assert.ok(provider);
      provider.getTopicDetails = async () => sampleDetails;
      const emptyRegistry = new ProviderRegistry(new HttpClient(), 'tests/fixtures');
      for (const registry of [populatedRegistry, emptyRegistry]) {
        const testServer = http.createServer(createApp(registry, { cache: sharedCache }));
        testServers.push(testServer);
        await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
        const port = (testServer.address() as { port: number }).port;
        baseUrls.push(`http://127.0.0.1:${port}/api/v2.0/indexers/rutor/details/12345`);
      }

      const first = await requestWithHost(baseUrls[0], 'shared.example');
      assert.equal(first.status, 200);
      assert.equal(first.cacheStatus, 'MISS');
      const cached = await requestWithHost(baseUrls[0], 'shared.example');
      assert.equal(cached.status, 200);
      assert.equal(cached.cacheStatus, 'HIT');
      assert.deepEqual(JSON.parse(cached.body), [sampleDetails]);

      const removed = await requestWithHost(baseUrls[1], 'shared.example');
      assert.equal(removed.status, 404);
      const body = JSON.parse(removed.body) as ApiErrorResponse;
      assert.equal(body.error, 'NotFound');
      assert.equal(body.message, "Indexer 'rutor' not found");
    } finally {
      await Promise.all(testServers.map(testServer => new Promise<void>(resolve => testServer.close(() => resolve()))));
    }
  });

  it('should partition cached topic details by response origin', async () => {
    const url = `${baseUrl}/api/v2.0/indexers/rutor/details/45678`;
    const first = await requestWithHost(url, 'first.example');
    assert.equal(first.status, 200);
    assert.equal(first.cacheStatus, 'MISS');

    const second = await requestWithHost(url, 'second.example');
    assert.equal(second.status, 200);
    assert.equal(second.cacheStatus, 'MISS');

    const repeated = await requestWithHost(url, 'second.example');
    assert.equal(repeated.cacheStatus, 'HIT');
  });

  it('should isolate topic details for public apps and apps with different configured keys sharing a cache', async () => {
    const sharedCache = new MemoryCache<unknown>(300);
    for (const apiKey of ['first-sample-key', undefined, 'second-sample-key']) {
      const registry = new ProviderRegistry(new HttpClient());
      const provider = registry.getProvider('rutor');
      assert.ok(provider);
      let lookupCount = 0;
      const expectedDetails = { ...sampleDetails, name: apiKey ? `Sample Topic ${apiKey}` : 'Public Sample Topic' };
      provider.getTopicDetails = async () => {
        lookupCount++;
        return expectedDetails;
      };
      const testServer = http.createServer(createApp(registry, { apiKey, cache: sharedCache }));
      await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
      try {
        const port = (testServer.address() as { port: number }).port;
        const keyParam = apiKey ? `?apikey=${apiKey}` : '';
        const url = `http://127.0.0.1:${port}/api/v2.0/indexers/rutor/details/42${keyParam}`;
        for (const expectedCacheStatus of ['MISS', 'HIT']) {
          const response = await requestWithHost(url, 'shared.example');
          assert.equal(response.status, 200);
          assert.equal(response.cacheStatus, expectedCacheStatus);
          assert.deepEqual(JSON.parse(response.body), [expectedDetails]);
        }
        assert.equal(lookupCount, 1);
      } finally {
        await new Promise<void>(resolve => testServer.close(() => resolve()));
      }
    }
  });

  it('should cache Torznab RSS feeds and serve second request from cache', async () => {
    // 1. Initial request (Cache Miss)
    const resFirst = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=SampleRss`);
    assert.equal(resFirst.status, 200);
    assert.equal(resFirst.headers.get('x-cache'), 'MISS');

    // 2. Subsequent identical request (Cache Hit)
    const resSecond = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=SampleRss`);
    assert.equal(resSecond.status, 200);
    assert.equal(resSecond.headers.get('x-cache'), 'HIT');
  });

  it('should partition cached Torznab feeds by response origin', async () => {
    const url = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=SampleOriginRss`;
    const first = await requestWithHost(url, 'first.example');
    assert.equal(first.cacheStatus, 'MISS');
    assert.match(first.body, /http:\/\/first\.example\/api\/v2\.0\/indexers\//);

    const second = await requestWithHost(url, 'second.example');
    assert.equal(second.cacheStatus, 'MISS');
    assert.match(second.body, /http:\/\/second\.example\/api\/v2\.0\/indexers\//);

    const repeated = await requestWithHost(url, 'second.example');
    assert.equal(repeated.cacheStatus, 'HIT');
  });

  it('should reject a request type that could collide with another Torznab cache key', async () => {
    const rejected = await fetch(
      `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search:collision&q=sample`
    );
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /<error code="201"/);

    const valid = await fetch(
      `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=collision:sample`
    );
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get('x-cache'), 'MISS');
  });

  it('should provide long-lived cache headers on caps endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=caps`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('cache-control')?.includes('s-maxage=86400'));
  });

  it('should use private Cache-Control and Vary headers for search when API key is present', async () => {
    // 1. Initial request (Cache Miss)
    const resFirst = await fetch(
      `${baseUrl}/api/v2.0/indexers/rutor/results?Query=SampleApiKeySearch&apikey=samplekey123`
    );
    assert.equal(resFirst.status, 200);
    assert.equal(resFirst.headers.get('x-cache'), 'MISS');
    assert.equal(resFirst.headers.get('cache-control'), 'private, max-age=60');
    assert.equal(resFirst.headers.get('vary'), 'Accept-Encoding, Cookie, X-Api-Key');

    // 2. Subsequent request (Cache Hit)
    const resSecond = await fetch(
      `${baseUrl}/api/v2.0/indexers/rutor/results?Query=SampleApiKeySearch&apikey=samplekey123`
    );
    assert.equal(resSecond.status, 200);
    assert.equal(resSecond.headers.get('x-cache'), 'HIT');
    assert.equal(resSecond.headers.get('cache-control'), 'private, max-age=60');
    assert.equal(resSecond.headers.get('vary'), 'Accept-Encoding, Cookie, X-Api-Key');
  });

  it('should use private Cache-Control and Vary headers for Torznab RSS when API key is present', async () => {
    // 1. Initial request (Cache Miss)
    const resFirst = await fetch(
      `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=SampleApiKeyRss&apikey=samplekey123`
    );
    assert.equal(resFirst.status, 200);
    assert.equal(resFirst.headers.get('x-cache'), 'MISS');
    assert.equal(resFirst.headers.get('cache-control'), 'private, max-age=60');
    assert.equal(resFirst.headers.get('vary'), 'Accept-Encoding, Cookie, X-Api-Key');

    // 2. Subsequent request (Cache Hit)
    const resSecond = await fetch(
      `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=SampleApiKeyRss&apikey=samplekey123`
    );
    assert.equal(resSecond.status, 200);
    assert.equal(resSecond.headers.get('x-cache'), 'HIT');
    assert.equal(resSecond.headers.get('cache-control'), 'private, max-age=60');
    assert.equal(resSecond.headers.get('vary'), 'Accept-Encoding, Cookie, X-Api-Key');
  });

  it('should use private Cache-Control and Vary headers for topic details when API key is present', async () => {
    for (const expectedCacheStatus of ['MISS', 'HIT']) {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/details/67890?apikey=samplekey123`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-cache'), expectedCacheStatus);
      assert.equal(res.headers.get('cache-control'), 'private, max-age=60');
      assert.equal(res.headers.get('vary'), 'Accept-Encoding, Cookie, X-Api-Key');
    }
  });
});

describe('Caching of searches with indexer errors', () => {
  let baseUrl: string;
  let isOutage = true;
  let partiallyFailingId: string | undefined;
  let server: http.Server;

  before(async () => {
    const registry = new ProviderRegistry(new HttpClient());
    for (const provider of registry.getAllProviders()) {
      provider.searchByTitle = async () => {
        if (isOutage || provider.id === partiallyFailingId) {
          throw new Error('Sample tracker outage');
        }
        return [];
      };
      provider.searchPageByTitle = undefined;
    }
    const app = createApp(registry, { cache: new MemoryCache<unknown>(300), cacheTtlSeconds: 300 });
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  });

  it('should not cache aggregated JSON results that report indexer errors', async () => {
    isOutage = true;
    const failing = await fetch(`${baseUrl}/api/v2.0/indexers/all/results?Query=outage-sample`);
    assert.equal(failing.headers.get('cache-control'), 'no-store');

    isOutage = false;
    const recovered = await fetch(`${baseUrl}/api/v2.0/indexers/all/results?Query=outage-sample`);
    assert.equal(recovered.headers.get('x-cache'), 'MISS');
    const body = (await recovered.json()) as JackettSearchResponse;
    assert.ok(body.Indexers.every(indexer => indexer.Error === null));
  });

  it('should not cache an aggregated Torznab feed missing a failed indexer', async () => {
    isOutage = false;
    partiallyFailingId = 'rutor';
    try {
      const partial = await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=search&q=partial-sample`);
      assert.equal(partial.status, 200);
      assert.equal(partial.headers.get('cache-control'), 'no-store');
    } finally {
      partiallyFailingId = undefined;
    }

    const recovered = await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=search&q=partial-sample`);
    assert.equal(recovered.headers.get('x-cache'), 'MISS');
  });

  it('should reuse one cache entry regardless of category order', async () => {
    isOutage = false;
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=order-sample&Category=5000,2000`);
    const reordered = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=order-sample&Category=2000,5000`);
    assert.equal(reordered.headers.get('x-cache'), 'HIT');
  });
});
