// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { MemoryCache } from '../../../src/cache/memory-cache.js';
import { CacheWrite } from '../../../src/cache/store.js';
import { getLocalTopicPathStore, getTopicPathStore } from '../../../src/cache/topic-path-cache.js';
import { UpstashRedisCache } from '../../../src/cache/upstash-cache.js';
import { HttpClient } from '../../../src/http/http-client.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';

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

  it('should keep topic paths in a single memory store with one write per path', async context => {
    const cache = new MemoryCache<unknown>();
    const sharedStore = getLocalTopicPathStore(cache);
    const writes = context.mock.method(sharedStore, 'set');
    const provider = createProvider();
    provider.shareTopicPaths(cache, 'sample-namespace', 300);
    const [item] = await provider.searchByTitle({ query: 'Sample' });
    assert.equal(writes.mock.callCount(), 1);
    assert.equal((await provider.getTopicDetails(item.id))?.url, item.url);
    sharedStore.clear();
    assert.equal((await provider.getTopicDetails(item.id))?.url, 'https://tracker.example/viewtopic.php?t=42');
  });

  it('should share the local Redis topic-path budget across providers', async context => {
    const cache = new UpstashRedisCache('https://redis.example', 'test-token');
    const remoteTopicPaths = new MemoryCache<unknown>();
    const stores = context.mock.method(cache, 'createHashStore', () => remoteTopicPaths);
    const first = createProvider();
    first.shareTopicPaths(cache, 'sample-namespace', 300);
    const [item] = await first.searchByTitle({ query: 'Sample' });
    remoteTopicPaths.clear();
    const second = createProvider();
    second.shareTopicPaths(cache, 'sample-namespace', 300);
    assert.equal(stores.mock.callCount(), 2);
    assert.equal((await second.getTopicDetails(item.id))?.url, item.url);
    getLocalTopicPathStore(cache).clear();
    assert.equal((await second.getTopicDetails(item.id))?.url, 'https://tracker.example/viewtopic.php?t=42');
    assert.equal((await first.getTopicDetails(item.id))?.url, 'https://tracker.example/viewtopic.php?t=42');
  });

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
