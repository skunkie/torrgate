// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toJackettSearchResponse } from '../../src/jackett/manual-search-results.js';
import { searchManualIndexers } from '../../src/search/manual-search.js';
import { TrackerProvider } from '../../src/types/provider.js';
import { TorrentItem } from '../../src/types/torrent.js';

function createTestProvider(id: string, searchByTitle: TrackerProvider['searchByTitle']): TrackerProvider {
  return {
    categoryMappings: [{ cat: 'Movies', id: 42 }],
    checkAvailability: async () => ({ isAvailable: true, name: id }),
    downloadTorrent: async () => ({ data: Buffer.alloc(0), fileName: 'sample.torrent' }),
    getTopicDetails: async () => null,
    id,
    name: id,
    searchByTitle,
    urls: ['https://tracker.example.test/'],
  };
}

const testItem: TorrentItem = {
  category: '42',
  date: '2024-08-15T00:00:00Z',
  downloadCount: 0,
  id: '42',
  leechers: 0,
  name: 'Sample Release',
  seeders: 1,
  size: '1 GB',
  sizeBytes: 1024 ** 3,
  torrentUrl: 'https://tracker.example.test/download/42',
  url: 'https://tracker.example.test/details/42',
};

describe('manual search coordination', () => {
  it('should measure elapsed milliseconds and serialize Jackett elapsed time', async context => {
    context.mock.timers.enable({ apis: ['Date'], now: 1_000 });
    context.after(() => context.mock.timers.reset());
    const provider = createTestProvider('sample', async () => {
      context.mock.timers.tick(125);
      return [];
    });

    const outcomes = await searchManualIndexers([provider], { query: 'Sample' });

    assert.equal(outcomes[0].elapsedTimeMs, 125);
    assert.equal(toJackettSearchResponse(outcomes, 'https://gateway.example.test').Indexers[0].ElapsedTime, 125);
  });

  it('should isolate options and failures while deduplicating within each provider', async () => {
    const first = createTestProvider('first', options => {
      options.categories?.push(5000);
      options.query = 'Changed';
      throw new Error('Sample failure');
    });
    const second = createTestProvider('second', async options => {
      assert.equal(options.query, 'Sample');
      assert.deepEqual(options.categories, [2000]);
      return [testItem, { ...testItem, id: 'duplicate' }];
    });
    const third = createTestProvider('third', async () => [testItem]);
    const options = { categories: [2000], query: 'Sample' };
    const outcomes = await searchManualIndexers([first, second, third], options);
    assert.deepEqual(options, { categories: [2000], query: 'Sample' });
    assert.deepEqual(outcomes.map(outcome => [outcome.error, outcome.items.length]), [['Sample failure', 0], [null, 1], [null, 1]]);
    const response = toJackettSearchResponse(outcomes, 'https://gateway.example.test');
    assert.deepEqual(response.Indexers.map(indexer => indexer.Status), [1, 2, 2]);
    assert.deepEqual(response.Results.map(result => result.TrackerId), ['second', 'third']);
    assert.deepEqual(response.Results[0].Category, [2000]);
  });

  it('should report an unadmitted provider as a successful empty outcome', async () => {
    const provider = createTestProvider('sample', () => { throw new Error('Unadmitted search'); });
    const [outcome] = await searchManualIndexers([provider], { categories: [5000], query: 'Sample' });
    assert.equal(outcome.elapsedTimeMs, 0);
    assert.equal(outcome.error, null);
    assert.deepEqual(outcome.items, []);
  });
});
