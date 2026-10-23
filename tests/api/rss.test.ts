// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { MemoryCache } from '../../src/cache/memory-cache.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { CUSTOM_CATEGORY_OFFSET, getTorznabCategory } from '../../src/jackett/categories/catalog.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { TorrentItem } from '../../src/types/torrent.js';

function testResultItem(providerId: string, position: number): TorrentItem {
  return {
    category: 'Video',
    date: '2024-08-15',
    downloadCount: 0,
    id: `${providerId}-${position}`,
    leechers: 0,
    name: `${providerId} Sample Release ${position}`,
    seeders: 1,
    size: '1 GB',
    torrentUrl: `https://example.org/${providerId}/download/${position}`,
    url: `https://example.org/${providerId}/details/${position}`,
  };
}

describe('RssController Integration', () => {
  let baseUrl: string;
  let cache: MemoryCache<unknown>;
  let registry: ProviderRegistry;
  let testServer: http.Server;

  before(async () => {
    const httpClient = new HttpClient();
    registry = new ProviderRegistry(httpClient);
    cache = new MemoryCache<unknown>(300);

    for (const provider of registry.getAllProviders()) {
      Object.defineProperty(provider, 'isConfigured', { configurable: true, value: true });
      provider.searchByTitle = async () => [
        {
          category: 'Video',
          categoryId: 7,
          date: '2024-08-15',
          downloadCount: 10,
          id: '54321',
          leechers: 3,
          magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
          name: 'Пример Фильма / Sample Movie Release',
          seeders: 25,
          size: '2.1 GB',
          sizeBytes: 2254857830,
          torrentUrl: 'https://example.org/download/54321',
          url: 'https://example.org/details/54321',
        },
      ];
    }

    const app = createApp(registry, { cache });

    await new Promise<void>(resolve => {
      testServer = app.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    cache.destroy();
    await new Promise<void>(resolve => {
      testServer.close(() => resolve());
    });
  });

  it('should return Torznab caps XML when t=caps', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=caps`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/xml/);
    const xml = await res.text();
    assert.match(xml, /<caps>/);
    assert.match(xml, /<categories>/);
    assert.match(xml, /<server title="TorrGate" \/>/);
  });

  it('should serve caps for the aggregated all-indexers feed with standard categories only', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=caps`);
    assert.equal(res.status, 200);
    const xml = await res.text();
    assert.match(xml, /<category id="5000" name="TV">/);
    assert.doesNotMatch(xml, /id="1\d{5}"/);
  });

  it('should list tracker categories under 100000 + id in single-indexer caps', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutracker-ru/results/torznab/api?t=caps`);
    const xml = await res.text();
    assert.match(xml, /<category id="1\d{5}" name="[^"]+" \/>/);
    const standardIds = [...xml.matchAll(/<(?:category|subcat) id="(\d+)"/g)].map(m => Number(m[1]));
    assert.ok(standardIds.every(id => id >= CUSTOM_CATEGORY_OFFSET || getTorznabCategory(id) !== undefined));
  });

  it('should describe single-indexer and aggregate feeds with Jackett channel metadata', async () => {
    const rutorXml = await (await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=channel-sample`)).text();
    const rutor = registry.getProvider('rutor')!;
    assert.match(rutorXml, new RegExp(`<atom:link href="${baseUrl}/" rel="self" type="application/rss\\+xml" />`));
    assert.ok(rutorXml.includes(`<title>RuTor</title>\n    <description>${rutor.description}</description>`));
    assert.ok(rutorXml.includes(`<link>${rutor.urls[0].replace(/\/?$/, '/')}</link>\n    <language>en-US</language>\n    <category>search</category>`));

    const allXml = await (await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=search&q=channel-sample`)).text();
    assert.ok(allXml.includes(
      '<title>AggregateSearch</title>\n    <description>This feed includes all configured trackers</description>\n    <link>http://127.0.0.1/</link>'
    ));
  });

  it('should search every indexer for the aggregated all-indexers feed', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=search&q=aggregate-sample`);
    assert.equal(res.status, 200);
    const xml = await res.text();
    const indexerIds = new Set([...xml.matchAll(/<jackettindexer id="([^"]+)">/g)].map(m => m[1]));
    assert.equal(indexerIds.size, registry.getAllProviders().length);
    assert.match(xml, /\/api\/v2\.0\/indexers\/rutor\/download\?url=/);
  });

  it('should return at most limit items from the aggregated feed', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=search&q=limit-sample`;
    const countItems = (xml: string): number => xml.match(/<item>/g)?.length ?? 0;

    const limited = await fetch(`${feedUrl}&limit=1`);
    assert.equal(limited.status, 200);
    assert.equal(countItems(await limited.text()), 1);

    const wider = await fetch(`${feedUrl}&limit=2`);
    assert.equal(wider.headers.get('x-cache'), 'MISS');
    assert.equal(countItems(await wider.text()), 2);

    const unlimited = await fetch(`${feedUrl}&limit=0`);
    assert.equal(unlimited.status, 200);
    assert.equal(countItems(await unlimited.text()), registry.getAllProviders().length);
  });

  it('should search each indexer once on its first page whatever the limit', async () => {
    const provider = registry.getProvider('rutor');
    assert.ok(provider);
    const originalSearch = provider.searchByTitle;
    let searchCount = 0;
    provider.searchByTitle = async () => {
      searchCount++;
      return [0, 1, 2].map(position => testResultItem(provider.id || provider.name, position));
    };

    try {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=single-page-sample&limit=500`);
      assert.equal(res.status, 200);
      assert.equal((await res.text()).match(/<item>/g)?.length, 3);
      assert.equal(searchCount, 1);
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should drop repeated results within an indexer by download link, then magnet, then details URL', async () => {
    const provider = registry.getProvider('rutor');
    assert.ok(provider);
    const originalSearch = provider.searchByTitle;
    const first = testResultItem('sample', 1);
    provider.searchByTitle = async () => [
      first,
      { ...first, name: 'Repeated Download Link' },
      { ...testResultItem('sample', 2), url: first.url },
      { ...testResultItem('sample', 3), magnetUri: 'magnet:?xt=urn:btih:sample', torrentUrl: '' },
      { ...testResultItem('sample', 4), magnetUri: 'magnet:?xt=urn:btih:sample', torrentUrl: '' },
    ];

    try {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=repeat-sample`);
      assert.equal(res.status, 200);
      const xml = await res.text();
      const titles = [...xml.matchAll(/<title>sample Sample Release (\d+)<\/title>/g)].map(m => Number(m[1]));
      assert.deepEqual(titles, [1, 2, 3]);
      const guids = [...xml.matchAll(/<guid>([^<]+)<\/guid>/g)].map(m => m[1]);
      assert.deepEqual(guids, [
        'https://example.org/sample/download/1',
        'https://example.org/sample/download/2',
        'magnet:?xt=urn:btih:sample',
      ]);
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should apply the limit before dropping repeated results, as Jackett does', async () => {
    const provider = registry.getProvider('rutor');
    assert.ok(provider);
    const originalSearch = provider.searchByTitle;
    const first = testResultItem('sample', 1);
    provider.searchByTitle = async () => [first, first, testResultItem('sample', 2), testResultItem('sample', 3)];

    try {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=limit-repeat-sample&limit=3`);
      assert.equal(res.status, 200);
      assert.equal((await res.text()).match(/<item>/g)?.length, 2);
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should answer an empty, uncached feed when every aggregate indexer fails, as Jackett does', async () => {
    const providers = registry.getAllProviders();
    const originalSearches = new Map(providers.map(provider => [provider, provider.searchByTitle]));

    try {
      for (const provider of providers) {
        provider.searchByTitle = async () => {
          throw new Error(`Sample outage on ${provider.id}`);
        };
      }

      const res = await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=search&q=outage-sample`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const xml = await res.text();
      assert.match(xml, /<channel>/);
      assert.doesNotMatch(xml, /<item>/);
    } finally {
      for (const provider of providers) {
        provider.searchByTitle = originalSearches.get(provider)!;
      }
    }
  });

  it('should order the aggregate feed by gain, highest first, before applying the limit', async () => {
    const providers = registry.getAllProviders();
    const originalSearches = new Map(providers.map(provider => [provider, provider.searchByTitle]));
    const sampleSizes: Record<string, number> = { kinozal: 4, rutor: 1 };

    try {
      for (const provider of providers) {
        const sizeGigabytes = sampleSizes[provider.id ?? ''];
        provider.searchByTitle = async () =>
          sizeGigabytes === undefined ? [] : [{ ...testResultItem(provider.id ?? provider.name, 0), sizeBytes: sizeGigabytes * 1024 ** 3 }];
      }

      const res = await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=search&q=gain-sample&limit=1`);
      const titles = [...(await res.text()).matchAll(/<title>([^<]+Sample Release[^<]*)<\/title>/g)].map(m => m[1]);
      assert.deepEqual(titles, ['kinozal Sample Release 0']);
    } finally {
      for (const provider of providers) {
        provider.searchByTitle = originalSearches.get(provider)!;
      }
    }
  });

  it('should return every result when no limit is given', async () => {
    const provider = registry.getProvider('rutor');
    assert.ok(provider);
    const originalSearch = provider.searchByTitle;
    provider.searchByTitle = async () =>
      Array.from({ length: 150 }, (_, position) => testResultItem(provider.id || provider.name, position));

    try {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=no-limit-sample`);
      assert.equal(res.status, 200);
      assert.equal((await res.text()).match(/<item>/g)?.length, 150);
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should return an empty feed without searching for an offset past the first page', async () => {
    const providers = registry.getAllProviders();
    const originalSearches = new Map(providers.map(provider => [provider, provider.searchByTitle]));
    let searchCount = 0;

    try {
      for (const provider of providers) {
        provider.searchByTitle = async () => {
          searchCount++;
          return [testResultItem(provider.id || provider.name, 0)];
        };
      }

      for (const indexer of ['rutor', 'all']) {
        const res = await fetch(`${baseUrl}/api/v2.0/indexers/${indexer}/results/torznab/api?t=search&q=offset-sample&offset=1`);
        assert.equal(res.status, 200, indexer);
        assert.equal(res.headers.get('x-cache'), null, indexer);
        const xml = await res.text();
        assert.match(xml, /<channel>/, indexer);
        assert.doesNotMatch(xml, /<item>/, indexer);
      }
      assert.equal(searchCount, 0);
    } finally {
      for (const provider of providers) {
        provider.searchByTitle = originalSearches.get(provider)!;
      }
    }
  });

  it('should answer invalid pagination values with a Torznab incorrect-parameter error', async () => {
    for (const pagination of ['limit=2147483648', 'offset=99999999999', 'limit=1,000.5']) {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=sample&${pagination}`);
      assert.equal(res.status, 400, pagination);
      assert.match(await res.text(), /<error code="201"/);
    }
  });

  it('should coerce lenient pagination values as Jackett does', async () => {
    for (const pagination of ['limit=-1', 'limit=many', 'offset=-5', 'offset=1.5']) {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=sample&${pagination}`);
      assert.equal(res.status, 200, pagination);
    }
  });

  it('should return Torznab RSS 2.0 XML with items when t=search', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=sample`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/xml/);
    const xml = await res.text();
    assert.match(xml, /<rss version="2.0"/);
    assert.match(xml, /<title>Пример Фильма \/ Sample Movie Release<\/title>/);
    assert.match(xml, /<torznab:attr name="seeders" value="25"/);
    assert.match(xml, /<torznab:attr name="peers" value="28"/);
  });

  it('should support t=tvsearch and t=movie modes', async () => {
    const tvRes = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=tvsearch&q=sample`);
    assert.equal(tvRes.status, 200);
    const movieRes = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=movie&q=sample`);
    assert.equal(movieRes.status, 200);
  });

  it('should escape special characters in Torznab error XML descriptions', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    rutorProvider.searchByTitle = async () => {
      throw new Error('Upstream failed with <script>alert("xss")</script> & \'quotes\'');
    };

    try {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?q=malicious`);
      assert.equal(res.status, 502);
      const xml = await res.text();
      assert.match(xml, /<error code="900"/);
      assert.ok(!xml.includes('<script>'));
      assert.ok(xml.includes('&lt;script&gt;'));
      assert.ok(xml.includes('&quot;xss&quot;'));
      assert.ok(xml.includes('&amp;'));
      assert.ok(xml.includes('&apos;quotes&apos;'));
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('should answer an invalid indexer identifier with a Torznab incorrect-parameter error', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/invalid%20indexer!/results/torznab/api`);
    assert.equal(res.status, 400);
    assert.match(res.headers.get('content-type') || '', /application\/xml/);
    assert.match(await res.text(), /<error code="201" description="Invalid indexer identifier format" \/>/);
  });

  it('should answer an unknown indexer with a Torznab incorrect-parameter error', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/nonexistent_tracker/results/torznab/api`);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /<error code="201" description="Indexer &apos;nonexistent_tracker&apos; not found" \/>/);
  });
});
