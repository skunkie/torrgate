// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { JackettSearchResponse } from '../../src/types/jackett.js';
import { TopicDetails, TorrentItem } from '../../src/types/torrent.js';
import { MemoryCache } from '../../src/utils/cache.js';

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
