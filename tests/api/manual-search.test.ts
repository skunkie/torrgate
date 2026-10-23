// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { JackettSearchResponse } from '../../src/jackett/types.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { SearchOptions } from '../../src/types/provider.js';
import { TorrentItem } from '../../src/types/torrent.js';

describe('Jackett manual search', () => {
  let origin: string;
  let testServer: http.Server;
  const registry = new ProviderRegistry(new HttpClient());
  const calls = new Map<string, SearchOptions[]>();
  const searches = new Map<string, () => Promise<TorrentItem[]>>();
  const sampleItem: TorrentItem = {
    category: '1',
    date: '2024-01-01',
    id: 'sample',
    leechers: 1,
    name: 'Sample Release',
    seeders: 5,
    size: '1 GB',
    sizeBytes: 1024 ** 3,
    torrentUrl: 'https://tracker.example/download/sample',
    url: 'https://tracker.example/details/sample',
  };

  before(async () => {
    for (const provider of registry.getAllProviders()) {
      Object.defineProperty(provider, 'isConfigured', { configurable: true, value: true });
      const id = provider.id!;
      provider.searchByTitle = async options => {
        const previous = calls.get(id) ?? [];
        calls.set(id, [...previous, options]);
        return searches.get(id)?.() ?? [];
      };
    }
    testServer = http.createServer(createApp(registry));
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(testServer.address() as { port: number }).port}/api/v2.0/indexers`;
  });

  beforeEach(() => {
    calls.clear();
    searches.clear();
  });

  after(async () => {
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  it('should search each selected indexer once and sort by publish date, preserving ties', async () => {
    searches.set('rutor', async () => [
      sampleItem,
      { ...sampleItem, date: '2024-03-01', id: 'newer', torrentUrl: 'https://tracker.example/download/newer' },
      { ...sampleItem, id: 'duplicate' },
    ]);
    searches.set('kinozal', async () => [{ ...sampleItem, id: 'tie' }]);
    const response = await fetch(`${origin}/all/results?Tracker[]=rutor,kinozal&Page=99&offset=600&limit=1`);
    const data = await response.json() as JackettSearchResponse;
    assert.equal(response.status, 200);
    assert.deepEqual(data.Results.map(item => item.Title), ['Sample Release', 'Sample Release', 'Sample Release']);
    assert.deepEqual(data.Results.map(item => [item.PublishDate, item.TrackerId]), [
      ['2024-03-01T00:00:00.000Z', 'rutor'],
      ['2024-01-01T00:00:00.000Z', 'kinozal'],
      ['2024-01-01T00:00:00.000Z', 'rutor'],
    ]);
    assert.deepEqual([...calls].map(([id, options]) => [id, options.length]), [['kinozal', 1], ['rutor', 1]]);
    assert.deepEqual(data.Indexers.map(indexer => indexer.Results), [1, 2]);
  });

  it('should isolate category arrays between providers in an interactive search', async () => {
    const first = registry.getProvider('kinozal')!;
    const second = registry.getProvider('rutor')!;
    const firstSearch = first.searchByTitle;
    const secondSearch = second.searchByTitle;
    let receivedCategories: number[] | undefined;
    first.searchByTitle = async options => {
      options.categories?.push(9999);
      return [];
    };
    second.searchByTitle = async options => {
      receivedCategories = options.categories;
      return [];
    };
    try {
      const response = await fetch(`${origin}/all/results?Tracker[]=kinozal,rutor&Category[]=2000`);
      assert.equal(response.status, 200);
      assert.deepEqual(receivedCategories, [2000]);
    } finally {
      first.searchByTitle = firstSearch;
      second.searchByTitle = secondSearch;
    }
  });

  it('should preserve an explicitly empty release description', async () => {
    searches.set('rutor', async () => [{ ...sampleItem, description: '' }]);
    const data = await (await fetch(`${origin}/rutor/results`)).json() as JackettSearchResponse;
    assert.equal(data.Results[0].Description, '');
  });

  it('should preserve absent peer counts and dates in interactive results', async () => {
    searches.set('rutor', async () => [
      { ...sampleItem, date: '', leechers: 8, seeders: undefined },
      { ...sampleItem, leechers: undefined, seeders: 0, torrentUrl: 'https://tracker.example/download/zero' },
    ]);
    const data = await (await fetch(`${origin}/rutor/results`)).json() as JackettSearchResponse;
    assert.deepEqual(data.Results.map(item => [item.Seeders, item.Peers, item.Gain, item.PublishDate]), [
      [0, 0, 0, '2024-01-01T00:00:00.000Z'],
      [null, null, null, '0001-01-01T00:00:00'],
    ]);
  });

  it('should preserve a magnet hash from the complete query before its fragment', async () => {
    searches.set('rutor', async () => [
      { ...sampleItem, magnetUri: 'magnet:?dn=Sample?Draft&XT=urn:btih:sampleHash#fragment', torrentUrl: '' },
      { ...sampleItem, magnetUri: 'magnet:?xt=', torrentUrl: '' },
      { ...sampleItem, infoHash: ' ', magnetUri: 'magnet:?xt=urn:btih:ActualHash', torrentUrl: '' },
      { ...sampleItem, infoHash: ' ExactHash ', magnetUri: 'magnet:?xt=urn:btih:IgnoredHash', torrentUrl: '' },
    ]);
    const response = await fetch(`${origin}/rutor/results`);
    const data = await response.json() as JackettSearchResponse;
    assert.deepEqual(data.Results.map(item => item.InfoHash), ['sampleHash', '', 'ActualHash', ' ExactHash ']);
  });

  it('should apply the raw Tracker[] filter by exact id on single and aggregate routes', async () => {
    for (const query of ['Tracker[]=RuTor', 'Tracker[]=RuTor%20', 'Tracker[]=RuTor,rutor', 'Tracker[]=']) {
      const response = await fetch(`${origin}/rutor/results?${query}`);
      const data = await response.json() as JackettSearchResponse;
      assert.equal(data.Indexers.length, query === 'Tracker[]=RuTor,rutor' ? 1 : 0, query);
    }
    calls.clear();
    const response = await fetch(`${origin}/all/results?tracker[]=rutor&Tracker=kinozal`);
    const data = await response.json() as JackettSearchResponse;
    assert.equal(data.Indexers.length, registry.getAllProviders().length);
    assert.ok([...calls.values()].every(options => options.length === 1));
  });

  it('should bind case-insensitive ids and blank values while retaining an explicit IMDb query', async () => {
    const response = await fetch(`${origin}/rutor/results?QuErY=+Sample+Show+S01E02+&IMDBID=tt123456&DOUBANID=-1&RageID=2&TvdbId=3&TmdbId=4&TvMazeId=5&TraktID=6`);
    assert.equal(response.status, 200);
    const options = calls.get('rutor')![0];
    assert.deepEqual(
      [options.query, options.season, options.episode, options.imdbId, options.doubanId, options.rageId, options.tvdbId, options.tmdbId, options.tvmazeId, options.traktId],
      ['Sample Show', 1, '2', 'tt123456', -1, 2, 3, 4, 5, 6]
    );
    await fetch(`${origin}/rutor/results?Query=%20&imdbid=%20&DOUBANID=%20&RageID=&TvdbId=%20&TmdbId=&TvMazeId=&TraktID=%20`);
    const blank = calls.get('rutor')![1];
    assert.deepEqual([blank.query, blank.imdbId, blank.doubanId, blank.rageId, blank.tvdbId, blank.tmdbId, blank.tvmazeId, blank.traktId], ['', undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
    await fetch(`${origin}/rutor/results?query=tt0123456&tvdbid=3&doubanid=2`);
    const detected = calls.get('rutor')![2];
    assert.deepEqual([detected.imdbId, detected.tvdbId, detected.doubanId], ['tt0123456', undefined, undefined]);
  });

  it('should retain the action distinction between bound nullable IDs and raw integer parsing', async () => {
    const response = await fetch(`${origin}/rutor/results?TmdbId=invalid&TvdbId=&DoubanID=invalid`);
    assert.equal(response.status, 200);
    const options = calls.get('rutor')![0];
    assert.deepEqual([options.tmdbId, options.tvdbId, options.doubanId], [undefined, undefined, undefined]);
    calls.clear();
    for (const query of ['tmdbid=invalid', 'tvdbid=', 'tvmazeid=%20', 'Category[]=2000,invalid']) {
      const invalid = await fetch(`${origin}/rutor/results?${query}`);
      assert.equal(invalid.status, 500, query);
    }
    assert.equal(calls.size, 0);
  });

  it('should preserve literal question marks and interleaved case variants in raw query values', async () => {
    const response = await fetch(`${origin}/rutor/results?Query=Sample?Draft&Category=2000&category=5000&Category=5040`);
    assert.equal(response.status, 200);
    const options = calls.get('rutor')![0];
    assert.equal(options.query, 'Sample?Draft');
    assert.deepEqual(options.categories, [2000, 5000, 5040]);
    calls.clear();
    const filtered = await (await fetch(`${origin}/rutor/results?Tracker[]=rutor?other`)).json() as JackettSearchResponse;
    assert.deepEqual(filtered.Indexers, []);
    assert.equal(calls.size, 0);
  });

  it('should use the first key spelling when applying the action raw-key checks', async () => {
    const filtered = await (await fetch(`${origin}/all/results?Tracker[]=rutor&tracker[]=kinozal`)).json() as JackettSearchResponse;
    assert.deepEqual(filtered.Indexers.map(indexer => indexer.ID), ['kinozal', 'rutor']);
    const unfiltered = await (await fetch(`${origin}/all/results?tracker[]=rutor&Tracker[]=kinozal`)).json() as JackettSearchResponse;
    assert.equal(unfiltered.Indexers.length, registry.getAllProviders().length);
    assert.equal((await fetch(`${origin}/rutor/results?TmdbId=invalid&tmdbid=1`)).status, 200);
    assert.equal((await fetch(`${origin}/rutor/results?tmdbid=1&TmdbId=2`)).status, 500);
  });

  it('should read the first model-bound query value and ignore unbound search extensions', async () => {
    await fetch(`${origin}/rutor/results?query=Sample&query=Ignored&q=Alias&Year=2024&format=1080&Page=invalid&offset=-1&limit=invalid&cat=5000`);
    const options = calls.get('rutor')![0];
    assert.deepEqual([options.query, options.year, options.format, options.categories], ['Sample', undefined, undefined, []]);
    await fetch(`${origin}/rutor/results?Category[]=2000,5000&Category[]=5040`);
    assert.deepEqual(calls.get('rutor')![1].categories, [2000, 5000, 5040]);
  });

  it('should retain successful results when another indexer fails and report individual elapsed times', async () => {
    searches.set('rutor', async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return [sampleItem];
    });
    searches.set('kinozal', async () => { throw new Error('Sample upstream failure'); });
    const response = await fetch(`${origin}/all/results?Tracker[]=rutor,kinozal`);
    const data = await response.json() as JackettSearchResponse;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(data.Results.map(item => item.TrackerId), ['rutor']);
    assert.deepEqual(data.Indexers[0], {
      ElapsedTime: 0,
      Error: 'Sample upstream failure',
      ID: 'kinozal',
      Name: registry.getProvider('kinozal')!.name,
      Results: 0,
      Status: 1,
    });
    assert.ok((data.Indexers[1].ElapsedTime ?? 0) >= 25);
    assert.equal(data.Indexers[1].Status, 2);
  });
});
