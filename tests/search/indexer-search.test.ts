// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { CardigannProvider } from '../../src/providers/cardigann/provider.js';
import { searchIndexers } from '../../src/search/indexer-search.js';
import { SearchOptions, TrackerProvider } from '../../src/types/provider.js';
import { TorrentItem } from '../../src/types/torrent.js';

function testItem(providerId: string, position: number, seeders: number, sizeGigabytes?: number): TorrentItem {
  return {
    category: 'Video',
    date: '2024-08-15',
    downloadCount: 0,
    id: `${providerId}-${position}`,
    leechers: 0,
    name: `${providerId} Sample Release ${position}`,
    seeders,
    size: '1 GB',
    sizeBytes: sizeGigabytes === undefined ? undefined : sizeGigabytes * 1024 ** 3,
    torrentUrl: `https://example.org/${providerId}/download/${position}`,
    url: `https://example.org/${providerId}/details/${position}`,
  };
}

function createTestProvider(id: string, search: TrackerProvider['searchByTitle']): TrackerProvider {
  return { id, name: id, searchByTitle: search } as Partial<TrackerProvider> as TrackerProvider;
}

const ids = (outcome: Awaited<ReturnType<typeof searchIndexers>>): string[] => outcome.results.map(result => result.item.id);

describe('searchIndexers', () => {
  it('should admit categories advertised by a plain provider', async () => {
    const provider = { ...createTestProvider('sample', async () => [testItem('sample', 1, 1, 1)]), categoryMappings: [{ cat: 'Movies', id: 42 }] };
    assert.deepEqual(ids(await searchIndexers([provider], { categories: [2000], query: 'Sample' }, { limit: 0 })), ['sample-1']);
    assert.deepEqual(ids(await searchIndexers([provider], { categories: [5000], query: 'Sample' }, { limit: 0 })), []);
  });

  it('should keep indexer order and trim each indexer and the merged results to the limit', async () => {
    const first = createTestProvider('a', async () => [testItem('a', 1, 1, 1), testItem('a', 2, 1, 1), testItem('a', 3, 1, 1)]);
    const second = createTestProvider('b', async () => [testItem('b', 1, 9, 9)]);

    assert.deepEqual(ids(await searchIndexers([first, second], { query: 'sample' }, { limit: 2 })), ['a-1', 'a-2']);
    assert.deepEqual(ids(await searchIndexers([first, second], { query: 'sample' }, { limit: 0 })), ['a-1', 'a-2', 'a-3', 'b-1']);
  });

  it('should give each provider its own search options and category array', async () => {
    const createProvider = (id: string) => new CardigannProvider({
      caps: { categories: { 1: 'Movies' } },
      id,
      links: ['https://tracker.example.test/'],
      name: id,
      search: { fields: {}, paths: [], rows: { selector: 'article' } },
    }, new HttpClient());
    const options: SearchOptions = { categories: [2000], query: 'Sample Original' };
    const first = createProvider('a');
    first.searchByTitle = async received => {
      received.query = 'Sample Changed';
      received.categories?.push(9999);
      return [];
    };
    const second = createProvider('b');
    second.searchByTitle = async received => {
      assert.equal(received.query, 'Sample Original');
      assert.deepEqual(received.categories, [2000]);
      return [testItem('b', 1, 1, 1)];
    };
    const outcome = await searchIndexers([first, second], options, { limit: 0 });
    assert.deepEqual(outcome.errors, {});
    assert.deepEqual(ids(outcome), ['b-1']);
    assert.deepEqual(options, { categories: [2000], query: 'Sample Original' });
  });

  it('should retain other providers when a provider throws before returning a promise', async () => {
    const first = createTestProvider('a', () => { throw new Error('Sample synchronous failure'); });
    const second = createTestProvider('b', async () => [testItem('b', 1, 1, 1)]);
    const outcome = await searchIndexers([first, second], { query: 'Sample' }, { limit: 0 });
    assert.deepEqual(outcome.errors, { a: 'Sample synchronous failure' });
    assert.deepEqual(ids(outcome), ['b-1']);
  });

  it('should drop repeated release GUIDs within an indexer after its limit, but not across indexers', async () => {
    const repeated = testItem('a', 1, 1, 1);
    const first = createTestProvider('a', async () => [repeated, { ...repeated, id: 'a-1-repeat' }, testItem('a', 2, 1, 1)]);
    const second = createTestProvider('b', async () => [{ ...repeated, id: 'b-1' }]);

    assert.deepEqual(ids(await searchIndexers([first, second], { query: 'sample' }, { limit: 0 })), ['a-1', 'a-2', 'b-1']);
    assert.deepEqual(ids(await searchIndexers([first], { query: 'sample' }, { limit: 2 })), ['a-1']);
  });

  it('should order merged results by gain, highest first, with sizeless results last', async () => {
    const first = createTestProvider('a', async () => [testItem('a', 1, 2, 1), testItem('a', 2, 5)]);
    const second = createTestProvider('b', async () => [testItem('b', 1, 1, 4), testItem('b', 2, 1, 2)]);

    const outcome = await searchIndexers([first, second], { query: 'sample' }, { isOrderedByGain: true, limit: 0 });

    assert.deepEqual(ids(outcome), ['b-1', 'a-1', 'b-2', 'a-2']);
  });

  it('should report failing indexers and keep the results of the others', async () => {
    const failing = createTestProvider('a', async () => {
      throw new Error('Sample outage');
    });
    const working = createTestProvider('b', async () => [testItem('b', 1, 1, 1)]);

    const outcome = await searchIndexers([failing, working], { query: 'sample' }, { limit: 0 });

    assert.deepEqual(outcome.errors, { a: 'Sample outage' });
    assert.deepEqual(ids(outcome), ['b-1']);
  });

  it('should leave out and abort indexers that miss the deadline', async () => {
    let slowSignal: AbortSignal | undefined;
    const slow = createTestProvider('a', async options => {
      slowSignal = options.signal;
      return new Promise<TorrentItem[]>(() => {});
    });
    const fast = createTestProvider('b', async () => [testItem('b', 1, 1, 1)]);

    const outcome = await searchIndexers([slow, fast], { query: 'sample' }, { limit: 0, timeoutMs: 20 });

    assert.deepEqual(ids(outcome), ['b-1']);
    assert.deepEqual(Object.keys(outcome.errors), ['a']);
    assert.equal(slowSignal?.aborted, true);
  });

  it('should stop listening for the deadline once every search has settled', async () => {
    const deadline = new AbortController();
    const originalTimeout = AbortSignal.timeout;
    AbortSignal.timeout = () => deadline.signal;
    try {
      const answering = createTestProvider('a', async () => [testItem('a', 1, 1, 1)]);
      const failing = createTestProvider('b', async () => {
        throw new Error('Sample outage');
      });

      await searchIndexers([answering, failing], { query: 'sample' }, { limit: 0, timeoutMs: 1_000 });

      assert.equal(getEventListeners(deadline.signal, 'abort').length, 0);
    } finally {
      AbortSignal.timeout = originalTimeout;
    }
  });

  it('should keep honoring the caller signal alongside the deadline', async () => {
    const caller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const provider = createTestProvider('a', async options => {
      receivedSignal = options.signal;
      return [];
    });

    await searchIndexers([provider], { query: 'sample', signal: caller.signal }, { limit: 0, timeoutMs: 1_000 });
    caller.abort();

    assert.equal(receivedSignal?.aborted, true);
  });
});
