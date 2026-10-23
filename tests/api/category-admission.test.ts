// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';

import { MemoryCache } from '../../src/cache/memory-cache.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { JackettSearchResponse } from '../../src/jackett/types.js';
import { CardigannProvider } from '../../src/providers/cardigann/provider.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { TrackerCategoryMapping } from '../../src/types/provider.js';

describe('Jackett category admission', () => {
  let origin: string;
  let testServer: http.Server;
  const requests: string[] = [];
  const searches: string[] = [];
  let requestId = 0;

  before(async () => {
    const httpClient = new HttpClient();
    httpClient.getDecoded = async url => {
      requests.push(new URL(url).hostname.split('.')[0]);
      return '<article data-category="42"><a href="details?id=1">Sample Release</a></article>';
    };
    const registry = new ProviderRegistry(httpClient, 'tests/fixtures');
    for (const [id, mappings] of [
      ['movies', [{ cat: 'Movies', desc: 'Sample Movies', id: 42 }]],
      ['tv', [{ cat: 'TV/HD', desc: 'Sample TV', id: 42 }]],
      ['unclassified', []],
    ] as Array<[string, TrackerCategoryMapping[]]>) {
      const provider = new CardigannProvider({
        caps: { categorymappings: mappings },
        id,
        links: [`https://${id}.example.test/`],
        name: `Sample ${id}`,
        search: {
          fields: {
            category: { attribute: 'data-category' },
            date: { text: '2024-01-01' },
            details: { attribute: 'href', selector: 'a' },
            size: { text: '1 GB' },
            title: { selector: 'a' },
          },
          paths: [{ path: 'search' }],
          rows: { selector: 'article' },
        },
      }, httpClient);
      const searchByTitle = provider.searchByTitle.bind(provider);
      provider.searchByTitle = options => {
        searches.push(id);
        return searchByTitle(options);
      };
      registry.registerProvider(provider);
    }
    testServer = http.createServer(createApp(registry, { cache: new MemoryCache<unknown>(60) }));
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(testServer.address() as { port: number }).port}/api/v2.0/indexers`;
  });

  beforeEach(() => { requests.length = 0; searches.length = 0; });
  after(async () => { await new Promise<void>(resolve => testServer.close(() => resolve())); });

  const search = (indexer: string, category: string, isJson: boolean): Promise<Response> => {
    const query = `Sample${requestId++}`;
    return fetch(`${origin}/${indexer}/results${isJson ? `?Query=${query}&Category[]=${category}` : `/torznab/api?q=${query}&cat=${category}`}`);
  };

  for (const isJson of [true, false]) {
    it(`should search only indexers advertising a requested category for ${isJson ? 'JSON' : 'Torznab'}`, async () => {
      const response = await search('all', '2000,9999', isJson);
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.deepEqual(requests, ['movies']);
      assert.deepEqual(searches, ['movies']);
      if (isJson) {
        const result = JSON.parse(body) as JackettSearchResponse;
        assert.deepEqual(result.Results.map(item => item.TrackerId), ['movies']);
        assert.deepEqual(result.Indexers.filter(indexer => indexer.ID !== 'movies').map(indexer => [indexer.ElapsedTime, indexer.Error, indexer.Results, indexer.Status]), [[0, null, 0, 2], [0, null, 0, 2]]);
      } else {
        assert.match(body, /<jackettindexer id="movies"/);
      }
    });

    it(`should return empty results without contacting trackers for unsupported ${isJson ? 'JSON' : 'Torznab'} categories`, async () => {
      for (const [indexer, category] of [['all', '42'], ['all', '9999'], ['movies', '5040'], ['unclassified', '2000']]) {
        const response = await search(indexer, category, isJson);
        assert.equal(response.status, 200);
        if (isJson) assert.deepEqual((await response.json() as JackettSearchResponse).Results, []);
        else assert.doesNotMatch(await response.text(), /<item>/);
        assert.deepEqual(requests, [], `${indexer}: ${category}`);
        assert.deepEqual(searches, [], `${indexer}: ${category}`);
      }
    });

    it(`should accept a tracker-specific ID on a single ${isJson ? 'JSON' : 'Torznab'} indexer`, async () => {
      const response = await search('movies', '100042', isJson);
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.match(body, /Sample Release/);
      assert.deepEqual(requests, ['movies']);
      assert.deepEqual(searches, ['movies']);
    });
  }

  it('should check aggregate caps before Torznab dispatch while JSON checks individual indexers', async () => {
    const feed = await search('all', '100042', false);
    assert.equal(feed.status, 200);
    assert.doesNotMatch(await feed.text(), /<item>/);
    assert.deepEqual(requests, []);
    assert.deepEqual(searches, []);
    const json = await search('all', '100042', true);
    const result = await json.json() as JackettSearchResponse;
    assert.deepEqual(result.Results.map(item => item.TrackerId), ['movies', 'tv']);
    assert.deepEqual(requests.sort(), ['movies', 'tv']);
  });

  it('should retain the original mixed category request after aggregate admission', async () => {
    const feed = await search('all', '2000,100042', false);
    assert.equal(feed.status, 200);
    const xml = await feed.text();
    assert.match(xml, /<jackettindexer id="movies"/);
    assert.match(xml, /<jackettindexer id="tv"/);
    assert.deepEqual(requests.sort(), ['movies', 'tv']);
  });

  it('should accept parent and child IDs only when the indexer advertises them', async () => {
    const feed = await search('tv', '5000', false);
    assert.match(await feed.text(), /Sample Release/);
    assert.deepEqual(requests, ['tv']);
    requests.length = 0;
    const unsupported = await search('tv', '5030', false);
    assert.doesNotMatch(await unsupported.text(), /<item>/);
    assert.deepEqual(requests, []);
  });
});
