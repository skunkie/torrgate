// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { MAX_WINDOW_PAGE_ROUNDS } from '../../src/providers/result-window.js';
import { TorrentItem } from '../../src/types/torrent.js';
import { MemoryCache } from '../../src/utils/cache.js';
import { CUSTOM_CATEGORY_OFFSET, getTorznabCategory } from '../../src/utils/category-mapping.js';

function testPageItem(providerId: string, page: number): TorrentItem {
  return {
    category: 'Video',
    date: '2024-08-15',
    downloadCount: 0,
    id: `${providerId}-${page}`,
    leechers: 0,
    name: `${providerId} Sample Release ${page}`,
    seeders: 1,
    size: '1 GB',
    torrentUrl: `https://example.org/${providerId}/download/${page}`,
    url: `https://example.org/${providerId}/details/${page}`,
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
      provider.searchPageByTitle = undefined;
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
    assert.match(xml, /<server version="1.0" title="TorrGate"/);
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

  it('should return an error when every aggregate indexer fails after an earlier page', async () => {
    const providers = registry.getAllProviders();
    const originalSearches = new Map(providers.map(provider => [provider, provider.searchByTitle]));

    try {
      for (const provider of providers) {
        provider.searchByTitle = async ({ page = 0 }) => {
          if (page > 0) {
            throw new Error(`Sample later-page outage on ${provider.id}`);
          }
          return [testPageItem(provider.id || provider.name, page)];
        };
      }

      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=search&q=later-outage-sample&offset=${providers.length}&limit=1`
      );

      assert.equal(res.status, 502);
      assert.match(await res.text(), /<error code="900"/);
    } finally {
      for (const provider of providers) {
        provider.searchByTitle = originalSearches.get(provider)!;
      }
    }
  });

  it('should return an error rather than a partial window at the page-round limit', async () => {
    const provider = registry.getProvider('rutor');
    assert.ok(provider);
    const originalSearch = provider.searchByTitle;
    provider.searchByTitle = async ({ page = 0 }) => [testPageItem(provider.id || provider.name, page)];

    try {
      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=bounded-window-sample&limit=${MAX_WINDOW_PAGE_ROUNDS + 1}`
      );

      assert.equal(res.status, 502);
      assert.match(await res.text(), /result window exceeded the page-round limit/);
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should answer invalid pagination values with a Torznab incorrect-parameter error', async () => {
    for (const pagination of ['limit=-1', 'limit=many', 'offset=-5', 'page=-1']) {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=sample&${pagination}`);
      assert.equal(res.status, 400, pagination);
      assert.match(await res.text(), /<error code="201"/);
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
