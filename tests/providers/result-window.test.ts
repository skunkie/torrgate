// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectResultWindow, MAX_WINDOW_PAGE_ROUNDS } from '../../src/providers/result-window.js';
import { TrackerProvider } from '../../src/types/provider.js';
import { TorrentItem } from '../../src/types/torrent.js';

interface StubProvider {
  provider: TrackerProvider;
  requestedPages: number[];
}

function testItem(providerId: string, position: number): TorrentItem {
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

/**
 * A provider stub serving `totalCount` results in pages of `pageSize`, or failing when
 * `failingPage` is requested.
 */
function stubProvider(id: string, totalCount: number, pageSize: number, failingPage?: number): StubProvider {
  const requestedPages: number[] = [];
  const provider = {
    id,
    name: id,
    searchByTitle: async ({ page = 0 }) => {
      requestedPages.push(page);
      if (page === failingPage) {
        throw new Error(`Sample outage on ${id}`);
      }
      const start = page * pageSize;
      return Array.from({ length: Math.max(0, Math.min(pageSize, totalCount - start)) }, (_, index) =>
        testItem(id, start + index)
      );
    },
  } as Partial<TrackerProvider> as TrackerProvider;
  return { provider, requestedPages };
}

const ids = (outcome: Awaited<ReturnType<typeof collectResultWindow>>): string[] =>
  outcome.results.map(result => result.item.id);

describe('collectResultWindow', () => {
  it('should order results page by page across indexers and continue where a window ended', async () => {
    const first = stubProvider('a', 5, 2);
    const second = stubProvider('b', 3, 2);
    const search = (offset: number) =>
      collectResultWindow([first.provider, second.provider], { query: 'sample' }, { limit: 10, offset });

    assert.deepEqual(ids(await search(0)), ['a-0', 'a-1', 'b-0', 'b-1', 'a-2', 'a-3', 'b-2', 'a-4']);
    assert.deepEqual(ids(await search(4)), ['a-2', 'a-3', 'b-2', 'a-4']);
    assert.deepEqual(ids(await search(7)), ['a-4']);
    assert.deepEqual(ids(await search(8)), []);
  });

  it('should continue into later rounds until the window is full', async () => {
    const first = stubProvider('a', 50, 2);
    const second = stubProvider('b', 50, 2);

    const outcome = await collectResultWindow([first.provider, second.provider], { query: 'sample' }, { limit: 5, offset: 1 });

    assert.deepEqual(ids(outcome), ['a-1', 'b-0', 'b-1', 'a-2', 'a-3']);
    assert.deepEqual(first.requestedPages, [0, 1]);
    assert.deepEqual(second.requestedPages, [0, 1]);
    assert.equal(outcome.results[1]?.provider, second.provider);
  });

  it('should read pages before the offset when one indexer is searched', async () => {
    const single = stubProvider('a', 100, 10);

    const outcome = await collectResultWindow([single.provider], { query: 'sample' }, { limit: 10, offset: 45 });

    assert.deepEqual(ids(outcome), Array.from({ length: 10 }, (_, index) => `a-${45 + index}`));
    assert.deepEqual(single.requestedPages, [0, 1, 2, 3, 4, 5]);
  });

  it('should fetch every page up to the offset when categories make page sizes vary', async () => {
    const single = stubProvider('a', 100, 10);

    const outcome = await collectResultWindow([single.provider], { categories: [5000], query: 'sample' }, { limit: 10, offset: 25 });

    assert.deepEqual(ids(outcome), Array.from({ length: 10 }, (_, index) => `a-${25 + index}`));
    assert.deepEqual(single.requestedPages, [0, 1, 2, 3]);
  });

  it('should return nothing for a window past the last result', async () => {
    const single = stubProvider('a', 25, 10);

    const outcome = await collectResultWindow([single.provider], { query: 'sample' }, { limit: 10, offset: 40 });

    assert.deepEqual(ids(outcome), []);
    assert.deepEqual(single.requestedPages, [0, 1, 2, 3]);
  });

  it('should stop asking an indexer that returns the same page again', async () => {
    const requestedPages: number[] = [];
    const repeating = {
      id: 'repeating',
      name: 'repeating',
      searchByTitle: async ({ page = 0 }) => {
        requestedPages.push(page);
        return [testItem('repeating', 0), testItem('repeating', 1)];
      },
    } as Partial<TrackerProvider> as TrackerProvider;

    const outcome = await collectResultWindow([repeating], { categories: [5000], query: 'sample' }, { limit: 10, offset: 2 });

    assert.deepEqual(ids(outcome), []);
    assert.deepEqual(requestedPages, [0, 1]);
  });

  it('should continue after a page repeats one sticky result', async () => {
    const requestedPages: number[] = [];
    const sticky = testItem('sticky', 0);
    const provider = {
      id: 'a',
      name: 'a',
      searchByTitle: async ({ page = 0 }) => {
        requestedPages.push(page);
        if (page > 2) return [];
        return [sticky, testItem('a', page + 1)];
      },
    } as Partial<TrackerProvider> as TrackerProvider;

    const outcome = await collectResultWindow([provider], { query: 'sample' }, { limit: 2, offset: 2 });

    assert.deepEqual(ids(outcome), ['a-2', 'a-3']);
    assert.deepEqual(requestedPages, [0, 1, 2]);
  });

  it('should preserve the requested offset when a sticky result repeats across earlier pages', async () => {
    const requestedPages: number[] = [];
    const sticky = testItem('sticky', 0);
    const provider = {
      id: 'a',
      name: 'a',
      searchByTitle: async ({ page = 0 }) => {
        requestedPages.push(page);
        if (page > 3) return [];
        return [sticky, testItem('a', page + 1)];
      },
    } as Partial<TrackerProvider> as TrackerProvider;

    const outcome = await collectResultWindow([provider], { query: 'sample' }, { limit: 1, offset: 4 });

    assert.deepEqual(ids(outcome), ['a-4']);
    assert.deepEqual(requestedPages, [0, 1, 2, 3]);
  });

  it('should deduplicate a sticky result whose displayed title changes', async () => {
    const requestedPages: number[] = [];
    const sticky = testItem('sticky', 0);
    const provider = {
      id: 'a',
      name: 'a',
      searchByTitle: async ({ page = 0 }) => {
        requestedPages.push(page);
        if (page === 0) return [sticky, testItem('a', 1)];
        if (page === 1) return [{ ...sticky, name: 'Updated Sample Release' }, testItem('a', 2)];
        return [];
      },
    } as Partial<TrackerProvider> as TrackerProvider;

    const outcome = await collectResultWindow([provider], { query: 'sample' }, { limit: 1, offset: 2 });

    assert.deepEqual(ids(outcome), ['a-2']);
    assert.deepEqual(requestedPages, [0, 1]);
  });

  it('should keep distinct ID-only results that have the same title', async () => {
    const first = { ...testItem('a', 1), name: 'Shared Sample Title', torrentUrl: '', url: '' };
    const second = { ...testItem('a', 2), name: 'Shared Sample Title', torrentUrl: '', url: '' };
    const provider = {
      id: 'a',
      name: 'a',
      searchByTitle: async ({ page = 0 }) => page === 0 ? [first, second] : [],
    } as Partial<TrackerProvider> as TrackerProvider;

    const outcome = await collectResultWindow([provider], { query: 'sample' }, { limit: 2, offset: 0 });

    assert.deepEqual(ids(outcome), ['a-1', 'a-2']);
  });

  it('should continue across a filtered page with no matching items when raw paging continues', async () => {
    const requestedPages: number[] = [];
    const provider = {
      id: 'a',
      name: 'a',
      searchByTitle: async () => [],
      searchPageByTitle: async ({ page = 0 }) => {
        requestedPages.push(page);
        return {
          hasMore: page < 2,
          items: page === 2 ? [testItem('a', 2)] : [],
          pageIdentity: `page-${page}`,
        };
      },
    } as Partial<TrackerProvider> as TrackerProvider;

    const outcome = await collectResultWindow(
      [provider],
      { categories: [5000], query: 'sample' },
      { limit: 1, offset: 0 }
    );

    assert.deepEqual(ids(outcome), ['a-2']);
    assert.deepEqual(requestedPages, [0, 1, 2]);
  });

  it('should keep paging through rows whose fallback ids repeat on every page', async () => {
    const positionalIds = stubProvider('a', 4, 2);
    const searchByTitle = positionalIds.provider.searchByTitle.bind(positionalIds.provider);
    positionalIds.provider.searchByTitle = async options =>
      (await searchByTitle(options)).map((item, index) => ({ ...item, id: String(index + 1), torrentUrl: '', url: '' }));

    const outcome = await collectResultWindow([positionalIds.provider], { categories: [5000], query: 'sample' }, { limit: 10, offset: 2 });

    assert.deepEqual(outcome.results.map(result => result.item.name), ['a Sample Release 2', 'a Sample Release 3']);
  });

  it('should report failing indexers and keep the results of the others', async () => {
    const failing = stubProvider('a', 10, 2, 0);
    const working = stubProvider('b', 2, 2);

    const outcome = await collectResultWindow([failing.provider, working.provider], { query: 'sample' }, { limit: 10, offset: 0 });

    assert.deepEqual(ids(outcome), ['b-0', 'b-1']);
    assert.deepEqual(Object.keys(outcome.errors), ['a']);
    assert.equal(outcome.successfulCount, 1);
  });

  it('should report an indexer failing on a later page', async () => {
    const failingLater = stubProvider('a', 10, 2, 1);

    const outcome = await collectResultWindow([failingLater.provider], { categories: [5000], query: 'sample' }, { limit: 10, offset: 2 });

    assert.deepEqual(ids(outcome), []);
    assert.deepEqual(Object.keys(outcome.errors), ['a']);
    assert.equal(outcome.successfulCount, 0);
  });

  it('should report truncation when a deep window exceeds the page-round limit', async () => {
    const single = stubProvider('a', 10_000, 1);

    const outcome = await collectResultWindow([single.provider], { categories: [5000], query: 'sample' }, { limit: 100, offset: 1_000 });

    assert.equal(single.requestedPages.length, MAX_WINDOW_PAGE_ROUNDS);
    assert.deepEqual(outcome.results, []);
    assert.equal(outcome.isTruncated, true);
  });

  it('should report truncation when a shallow window exceeds the page-round limit', async () => {
    const single = stubProvider('a', 10_000, 1);

    const outcome = await collectResultWindow(
      [single.provider],
      { categories: [5000], query: 'sample' },
      { limit: MAX_WINDOW_PAGE_ROUNDS + 1, offset: 0 }
    );

    assert.deepEqual(ids(outcome), Array.from({ length: MAX_WINDOW_PAGE_ROUNDS }, (_, index) => `a-${index}`));
    assert.equal(outcome.isTruncated, true);
  });
});
