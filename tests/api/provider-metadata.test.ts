// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { BASIC_SEARCH_CAPS } from '../../src/jackett/torznab/caps.js';
import { JackettIndexer } from '../../src/jackett/types.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { TrackerProvider } from '../../src/types/provider.js';

describe('provider metadata contract', () => {
  const provider: TrackerProvider = {
    caps: { CategoryMapping: [{ Cat: 'Movies', Desc: 'Sample Section', ID: 42 }] },
    categoryMappings: [{ cat: 'Movies', desc: 'Sample Section', id: 42 }],
    checkAvailability: async () => ({ isAvailable: true, name: 'Sample Tracker' }),
    description: 'Sample indexer description',
    downloadTorrent: async () => ({ data: Buffer.alloc(0), fileName: 'sample.torrent' }),
    getTopicDetails: async () => null,
    id: 'sample',
    isConfigured: true,
    language: 'en-US',
    name: 'Sample Tracker',
    searchByTitle: async () => [],
    searchCaps: BASIC_SEARCH_CAPS,
    type: 'public',
    urls: ['https://tracker.example.test/'],
  };
  let baseUrl: string;
  let testServer: http.Server;

  before(async () => {
    const registry = new ProviderRegistry(new HttpClient(), 'tests/fixtures');
    registry.registerProvider(provider);
    testServer = http.createServer(createApp(registry));
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    const address = testServer.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}/api/v2.0/indexers`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => testServer.close(error => error ? reject(error) : resolve()));
  });

  it('should list capabilities supplied by a plain provider', async () => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 200);
    const indexers = await response.json() as JackettIndexer[];
    assert.deepEqual(indexers[0].caps, provider.caps);
    assert.equal(indexers[0].configured, true);
  });

  it('should expose inspection categories and Torznab categories from provider metadata', async () => {
    const inspection = await fetch(`${baseUrl}/sample/categories`);
    assert.equal(inspection.status, 200);
    assert.deepEqual(await inspection.json(), [{ id: 42, name: 'Sample Section' }]);
    const response = await fetch(`${baseUrl}/sample/results/torznab/api?t=caps`);
    assert.equal(response.status, 200);
    const caps = await response.text();
    assert.match(caps, /<category id="2000" name="Movies"/);
    assert.match(caps, /<category id="100042" name="Sample Section"/);
  });

  it('should discover a plain provider with its embedded capabilities', async () => {
    const response = await fetch(`${baseUrl}/all/results/torznab/api?t=indexers`);
    assert.equal(response.status, 200);
    const indexers = await response.text();
    assert.match(indexers, /<indexer id="sample" configured="true">/);
    assert.match(indexers, /<description>Sample indexer description<\/description>/);
    assert.match(indexers, /<category id="100042" name="Sample Section"/);
  });
});
