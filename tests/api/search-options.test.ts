// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';

import { MemoryCache } from '../../src/cache/memory-cache.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { TorznabSearchCaps } from '../../src/jackett/torznab/caps.js';
import { JackettSearchResponse } from '../../src/jackett/types.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { SearchOptions } from '../../src/types/provider.js';

const SEARCH_DELAY_MS = 30;

describe('Search request options', () => {
  let baseUrl: string;
  let receivedOptions: SearchOptions[];
  let testServer: http.Server;

  function createTestRegistry(): ProviderRegistry {
    const registry = new ProviderRegistry(new HttpClient());
    for (const provider of registry.getAllProviders()) {
      Object.defineProperty(provider, 'isConfigured', { configurable: true, value: true });
      provider.searchByTitle = async options => {
        receivedOptions.push(options);
        await new Promise(resolve => setTimeout(resolve, SEARCH_DELAY_MS));
        return [];
      };
    }
    return registry;
  }

  before(async () => {
    testServer = http.createServer(createApp(createTestRegistry()));
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(testServer.address() as { port: number }).port}`;
  });

  beforeEach(() => {
    receivedOptions = [];
  });

  after(async () => {
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  it('should report aggregate indexer elapsed time measured after the searches finish', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/all/results?Query=Example`);
    const data = await res.json() as JackettSearchResponse;
    for (const indexer of data.Indexers) {
      assert.ok((indexer.ElapsedTime ?? 0) >= SEARCH_DELAY_MS - 5, `${indexer.ID} took ${indexer.ElapsedTime}`);
    }

    const limitedRes = await fetch(`${baseUrl}/api/v2.0/indexers/all/results?Query=Example&limit=10`);
    const limitedData = await limitedRes.json() as JackettSearchResponse;
    assert.ok(limitedData.Indexers.every(indexer => (indexer.ElapsedTime ?? 0) >= SEARCH_DELAY_MS - 5));
  });

  it('should preserve JSON IMDb values and normalize Torznab IMDb ids', async () => {
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?imdbid=123456`);
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=movie&imdbid=tt0123456`);
    assert.deepEqual(receivedOptions.map(options => options.imdbId), ['123456', 'tt0123456']);
  });

  it('should preserve JSON IMDb values and reject invalid Torznab IMDb ids', async () => {
    const jsonRes = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?imdbid=nm0123456`);
    assert.equal(jsonRes.status, 200);
    const feedRes = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=movie&imdbid=tt`);
    assert.equal(feedRes.status, 400);
    assert.match(await feedRes.text(), /<error code="201"/);
    assert.deepEqual(receivedOptions.map(options => options.imdbId), ['nm0123456']);
  });

  it('should search Torznab movies by IMDb id together with keywords, as Jackett does', async () => {
    const jsonRes = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?imdbid=tt0123456&Query=Example`);
    assert.equal(jsonRes.status, 200);

    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=movie&imdbid=tt0123456&q=Sample+Film`);
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?imdbid=tt0123456&Query=S01E02`);
    assert.deepEqual(
      receivedOptions.map(options => [options.imdbId, options.query, options.season, options.episode]),
      [
        ['tt0123456', 'Example', undefined, undefined],
        ['tt0123456', 'Sample Film', undefined, undefined],
        ['tt0123456', '', 1, '2'],
      ]
    );
  });

  it('should search TV by IMDb id on indexers whose definitions allow it, except through all', async () => {
    const registry = createTestRegistry();
    const rutor = registry.getProvider('rutor') as { searchCaps: TorznabSearchCaps };
    rutor.searchCaps = { ...rutor.searchCaps, supportsTvImdbSearch: true };
    const testTvImdbServer = http.createServer(createApp(registry));
    await new Promise<void>(resolve => testTvImdbServer.listen(0, '127.0.0.1', resolve));
    const indexersUrl = `http://127.0.0.1:${(testTvImdbServer.address() as { port: number }).port}/api/v2.0/indexers`;
    try {
      const caps = await (await fetch(`${indexersUrl}/rutor/results/torznab/api?t=caps`)).text();
      assert.match(caps, /<tv-search available="yes" supportedParams="q,season,ep,imdbid" \/>/);
      const res = await fetch(`${indexersUrl}/rutor/results/torznab/api?t=tvsearch&imdbid=tt0123456&season=1&ep=2`);
      assert.equal(res.status, 200);
      const allRes = await fetch(`${indexersUrl}/all/results/torznab/api?t=tvsearch&imdbid=tt0123456`);
      assert.match(await allRes.text(), /<error code="203"/);
    } finally {
      await new Promise<void>(resolve => testTvImdbServer.close(() => resolve()));
    }
    assert.deepEqual(receivedOptions.map(options => [options.imdbId, options.season, options.episode]), [['tt0123456', 1, '2']]);
  });

  it('should answer a Torznab TV search by IMDb id with error 203 when the definition does not allow it', async () => {
    for (const indexer of ['rutor', 'all']) {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/${indexer}/results/torznab/api?t=tvsearch&imdbid=tt0123456&season=1&ep=2`);
      assert.equal(res.status, 400, indexer);
      assert.match(await res.text(), /<error code="203" description="Function Not Available: imdbid is not supported for TV search by this indexer"/);
    }
    assert.equal(receivedOptions.length, 0);
  });

  it('should reject Torznab searches the indexer caps cannot handle, as Jackett does', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers`;
    for (const sampleRequest of ['kinozal/results/torznab/api?t=movie&imdbid=tt0123456', 'newstudio/results/torznab/api?t=movie&q=Sample+Film', 'rutor/results/torznab/api?t=book&q=Sample+Book']) {
      const res = await fetch(`${feedUrl}/${sampleRequest}`);
      assert.equal(res.status, 400, sampleRequest);
      assert.match(await res.text(), /<error code="201" description="\w+ does not support the requested query\./);
    }
    assert.equal(receivedOptions.length, 0);
  });

  it('should search only the indexers whose caps can handle an aggregate Torznab search', async () => {
    const registry = createTestRegistry();
    const searchedIds: string[] = [];
    for (const provider of registry.getAllProviders()) {
      Object.defineProperty(provider, 'isConfigured', { configurable: true, value: true });
      provider.searchByTitle = async () => {
        searchedIds.push(provider.id ?? provider.name);
        return [];
      };
    }
    const testAggregateServer = http.createServer(createApp(registry));
    await new Promise<void>(resolve => testAggregateServer.listen(0, '127.0.0.1', resolve));
    const feedUrl = `http://127.0.0.1:${(testAggregateServer.address() as { port: number }).port}/api/v2.0/indexers/all/results/torznab/api`;
    try {
      await fetch(`${feedUrl}?t=movie&imdbid=tt0123456`);
      const imdbSearchIds = [...searchedIds];
      searchedIds.length = 0;
      await fetch(`${feedUrl}?t=book&q=Sample+Book`);
      const expectedBookIds = registry.getAllProviders()
        .filter(provider => (provider.searchCaps?.modes['book-search']?.length ?? 0) > 0)
        .map(provider => provider.id ?? provider.name);

      assert.deepEqual(imdbSearchIds, ['rutor']);
      assert.ok(expectedBookIds.length > 0);
      assert.deepEqual([...searchedIds].sort(), [...expectedBookIds].sort());
    } finally {
      await new Promise<void>(resolve => testAggregateServer.close(() => resolve()));
    }
  });

  it('should pass music and book request types to definitions as the search type', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/kinozal/results/torznab/api`;
    await fetch(`${feedUrl}?t=music&q=Test+Artist`);
    await fetch(`${feedUrl}?t=book&q=Sample+Book`);
    await fetch(`${feedUrl}?q=Sample+Film`);
    assert.deepEqual(receivedOptions.map(options => [options.searchType, options.query]), [
      ['music', 'Test Artist'],
      ['book', 'Sample Book'],
      ['search', 'Sample Film'],
    ]);
  });

  it('should read only Jackett Torznab parameter names', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    await fetch(`${feedUrl}?t=search&query=Sample+Film&category=2000&page=-1`);
    assert.deepEqual(receivedOptions.map(options => [options.query, options.categories]), [['', []]]);
  });

  it('should pass the Torznab search term, season and ep through separately for every search type', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    await fetch(`${feedUrl}?t=search&q=Sample+Show&season=1`);
    await fetch(`${feedUrl}?t=tvsearch&q=Sample+Show+S01E02&season=1&ep=2`);
    await fetch(`${feedUrl}?t=tvsearch&q=Sample+Show&season=0&ep=2`);
    await fetch(`${feedUrl}?t=tvsearch&q=Sample+Show&season=2024&ep=10/21`);
    assert.deepEqual(
      receivedOptions.map(options => [options.query, options.season, options.episode]),
      [
        ['Sample Show', 1, undefined],
        ['Sample Show S01E02', 1, '2'],
        ['Sample Show', 0, '2'],
        ['Sample Show', 2024, '10/21'],
      ]
    );
  });

  it('should split a trailing season and episode tag from the JSON search query', async () => {
    const searchUrl = `${baseUrl}/api/v2.0/indexers/rutor/results`;
    await fetch(`${searchUrl}?Query=Sample+Show+S01E02`);
    await fetch(`${searchUrl}?Query=Sample+Show+S2024E007A`);
    await fetch(`${searchUrl}?Query=Sample+Show+S03`);
    await fetch(`${searchUrl}?Query=Sample+Show+E04`);
    await fetch(`${searchUrl}?Query=Sample+Show+S01E02+Extra`);
    assert.deepEqual(
      receivedOptions.map(options => [options.query, options.season, options.episode]),
      [
        ['Sample Show', 1, '2'],
        ['Sample Show', 2024, '7A'],
        ['Sample Show', 3, undefined],
        ['Sample Show', undefined, '4'],
        ['Sample Show S01E02 Extra', undefined, undefined],
      ]
    );
  });

  it('should search a JSON Query that is an IMDb title id as that id, keeping its episode tag', async () => {
    const searchUrl = `${baseUrl}/api/v2.0/indexers/rutor/results`;
    await fetch(`${searchUrl}?Query=tt0123456`);
    await fetch(`${searchUrl}?Query=tt123456+S01E02`);
    await fetch(`${searchUrl}?Query=tt123456789`);
    await fetch(`${searchUrl}?Query=tt0000000`);
    await fetch(`${searchUrl}?Query=tt0123456&imdbid=tt7654321`);
    assert.deepEqual(
      receivedOptions.map(options => [options.imdbId, options.query, options.season, options.episode]),
      [
        ['tt0123456', '', undefined, undefined],
        ['tt0123456', '', 1, '2'],
        [undefined, 'tt123456789', undefined, undefined],
        [undefined, 'tt0000000', undefined, undefined],
        ['tt0123456', '', undefined, undefined],
      ]
    );
  });

  it('should keep JSON searches that differ only in their episode tag apart in the cache', async () => {
    const testCachedServer = http.createServer(createApp(createTestRegistry(), { cache: new MemoryCache<unknown>(60) }));
    await new Promise<void>(resolve => testCachedServer.listen(0, '127.0.0.1', resolve));
    const cachedUrl = `http://127.0.0.1:${(testCachedServer.address() as { port: number }).port}`;
    try {
      await fetch(`${cachedUrl}/api/v2.0/indexers/rutor/results?Query=Sample+Show+S01E02`);
      await fetch(`${cachedUrl}/api/v2.0/indexers/rutor/results?Query=Sample+Show+S01E03`);
      await fetch(`${cachedUrl}/api/v2.0/indexers/rutor/results?Query=Sample+Show+S01E03`);
    } finally {
      await new Promise<void>(resolve => testCachedServer.close(() => resolve()));
    }
    assert.deepEqual(receivedOptions.map(options => options.episode), ['2', '3']);
  });

  it('should reject a season that is not an integer', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=tvsearch&q=Sample+Show&season=abc`);
    assert.equal(res.status, 400);
    assert.match(await res.text(), /<error code="201" description="season must be an integer"/);
    assert.equal(receivedOptions.length, 0);
  });

  it('should pass the Torznab year through as an integer', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    await fetch(`${feedUrl}?t=movie&q=Sample+Film&year=2024`);
    await fetch(`${feedUrl}?t=movie&q=Sample+Film&year=+2024+`);
    await fetch(`${feedUrl}?t=movie&q=Sample+Film&year=0`);
    await fetch(`${feedUrl}?t=movie&q=Sample+Film&year=`);
    await fetch(`${feedUrl}?t=movie&q=Sample+Film`);
    assert.deepEqual(
      receivedOptions.map(options => [options.query, options.year]),
      [
        ['Sample Film', 2024],
        ['Sample Film', 2024],
        ['Sample Film', 0],
        ['Sample Film', undefined],
        ['Sample Film', undefined],
      ]
    );
  });

  it('should read Torznab parameter names case-insensitively', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    await fetch(`${feedUrl}?T=tvsearch&Q=Sample+Show&Season=1&EP=2&Year=2024&Cat=5000&LIMIT=10&Offset=0`);
    await fetch(`${feedUrl}?t=movie&IMDBID=tt0123456`);
    assert.deepEqual(
      receivedOptions.map(options => [options.query, options.season, options.episode, options.year, options.categories, options.imdbId]),
      [
        ['Sample Show', 1, '2', 2024, [5000], undefined],
        ['', undefined, undefined, undefined, [2000], 'tt0123456'],
      ]
    );

    const res = await fetch(`${feedUrl}?t=movie&Q=Sample+Film&YEAR=abc`);
    assert.match(await res.text(), /<error code="201" description="year must be an integer"/);

    const caps = await (await fetch(`${feedUrl}?T=caps`)).text();
    assert.match(caps, /<caps>/);
  });

  it('should match the Torznab request type case-sensitively, as Jackett does', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    for (const sampleType of ['Caps', 'Movie', 'TVSEARCH', 'tv-search']) {
      const res = await fetch(`${feedUrl}?t=${sampleType}&q=Sample+Film`);
      assert.equal(res.status, 400, sampleType);
      assert.match(await res.text(), /<error code="201" description="rutor does not support the requested query\./);
    }
    assert.equal(receivedOptions.length, 0);
  });

  it('should ignore JSON parameters not bound by ApiSearch', async () => {
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=Sample+Film&Year=2024`);
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=Sample+Film&Year=0`);
    assert.deepEqual(receivedOptions.map(options => options.year), [undefined, undefined]);
  });

  it('should reject a Torznab year that is not an integer', async () => {
    for (const sampleYear of ['abc', '2024.5', '2147483648']) {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=movie&q=Sample+Film&year=${sampleYear}`);
      assert.equal(res.status, 400, sampleYear);
      assert.match(await res.text(), /<error code="201" description="year must be an integer"/);
    }
    assert.equal(receivedOptions.length, 0);
  });

  it('should reject a Torznab cat entry that is not an integer, caps requests included', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    for (const sampleQuery of ['t=search&q=Sample+Film&cat=5000,abc', 't=caps&cat=abc']) {
      const res = await fetch(`${feedUrl}?${sampleQuery}`);
      assert.equal(res.status, 400, sampleQuery);
      assert.match(await res.text(), /<error code="201" description="cat must be a comma-separated list of integers"/);
    }
    assert.equal(receivedOptions.length, 0);

    await fetch(`${feedUrl}?t=search&q=Sample+Film&cat=2000,,5000`);
    await fetch(`${feedUrl}?t=search&q=Sample+Film&cat=2000&cat=abc`);
    assert.deepEqual(receivedOptions.map(options => options.categories), [[2000, 5000], [2000]]);
  });

  it('should search Movies for a Torznab movie IMDb search without categories, as Jackett does', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    await fetch(`${feedUrl}?t=movie&imdbid=tt0123456`);
    await fetch(`${feedUrl}?t=movie&imdbid=tt0123456&cat=`);
    await fetch(`${feedUrl}?t=movie&imdbid=tt0123456&cat=5000`);
    await fetch(`${feedUrl}?t=search&imdbid=tt0123456`);
    await fetch(`${feedUrl}?t=movie&q=Sample+Film`);
    assert.deepEqual(receivedOptions.map(options => options.categories), [[2000], [2000], [5000], [], []]);
  });

  it('should reject a non-integer season or year on caps requests too', async () => {
    const capsUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=caps`;
    const seasonRes = await fetch(`${capsUrl}&season=abc`);
    assert.equal(seasonRes.status, 400);
    assert.match(await seasonRes.text(), /<error code="201" description="season must be an integer"/);

    const yearRes = await fetch(`${capsUrl}&year=abc`);
    assert.equal(yearRes.status, 400);
    assert.match(await yearRes.text(), /<error code="201" description="year must be an integer"/);

    const validRes = await fetch(`${capsUrl}&season=1&year=2024`);
    assert.equal(validRes.status, 200);
    assert.match(await validRes.text(), /<caps>/);
  });

  it('should keep Torznab searches that differ only in their year apart in the cache', async () => {
    const testCachedServer = http.createServer(createApp(createTestRegistry(), { cache: new MemoryCache<unknown>(60) }));
    await new Promise<void>(resolve => testCachedServer.listen(0, '127.0.0.1', resolve));
    const feedUrl = `http://127.0.0.1:${(testCachedServer.address() as { port: number }).port}/api/v2.0/indexers/rutor/results/torznab/api`;
    try {
      await fetch(`${feedUrl}?t=movie&q=Sample+Film`);
      await fetch(`${feedUrl}?t=movie&q=Sample+Film&year=2024`);
      await fetch(`${feedUrl}?t=movie&q=Sample+Film&year=2025`);
      await fetch(`${feedUrl}?t=movie&q=Sample+Film&year=2025`);
    } finally {
      await new Promise<void>(resolve => testCachedServer.close(() => resolve()));
    }
    assert.deepEqual(receivedOptions.map(options => options.year), [undefined, 2024, 2025]);
  });

  it('should advertise year in caps for the modes an indexer accepts it in', async () => {
    const registry = createTestRegistry();
    const rutor = registry.getProvider('rutor') as { searchCaps: TorznabSearchCaps };
    rutor.searchCaps = { ...rutor.searchCaps, modes: { ...rutor.searchCaps.modes, 'movie-search': ['q', 'imdbid', 'year'] } };
    const testCapsServer = http.createServer(createApp(registry));
    await new Promise<void>(resolve => testCapsServer.listen(0, '127.0.0.1', resolve));
    const capsUrl = `http://127.0.0.1:${(testCapsServer.address() as { port: number }).port}/api/v2.0/indexers`;
    try {
      const rutorCaps = await (await fetch(`${capsUrl}/rutor/results/torznab/api?t=caps`)).text();
      assert.match(rutorCaps, /<movie-search available="yes" supportedParams="q,imdbid,year" \/>/);
      assert.match(rutorCaps, /<tv-search available="yes" supportedParams="q,season,ep" \/>/);

      const allCaps = await (await fetch(`${capsUrl}/all/results/torznab/api?t=caps`)).text();
      assert.match(allCaps, /<movie-search available="yes" supportedParams="q,imdbid,year" searchEngine="raw" \/>/);
    } finally {
      await new Promise<void>(resolve => testCapsServer.close(() => resolve()));
    }
  });

  it('should advertise the search modes of each indexer as Jackett does', async () => {
    const rutorCaps = await (await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=caps`)).text();
    assert.match(rutorCaps, /<limits default="100" max="100" \/>/);
    assert.match(rutorCaps, /<search available="yes" supportedParams="q" \/>/);
    assert.match(rutorCaps, /<tv-search available="yes" supportedParams="q,season,ep" \/>/);
    assert.match(rutorCaps, /<movie-search available="yes" supportedParams="q,imdbid" \/>/);
    assert.match(rutorCaps, /<music-search available="yes" supportedParams="q" \/>/);
    assert.match(rutorCaps, /<book-search available="no" supportedParams="q" \/>/);

    const kinozalCaps = await (await fetch(`${baseUrl}/api/v2.0/indexers/kinozal/results/torznab/api?t=caps`)).text();
    assert.match(kinozalCaps, /<movie-search available="yes" supportedParams="q" searchEngine="raw" \/>/);
    assert.match(kinozalCaps, /<book-search available="yes" supportedParams="q" searchEngine="raw" \/>/);

    const newstudioCaps = await (await fetch(`${baseUrl}/api/v2.0/indexers/newstudio/results/torznab/api?t=caps`)).text();
    assert.match(newstudioCaps, /<movie-search available="no" supportedParams="q" \/>/);

    const allCaps = await (await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=caps`)).text();
    assert.match(allCaps, /<movie-search available="yes" supportedParams="q,imdbid" searchEngine="raw" \/>/);
    assert.match(allCaps, /<limits default="1000" max="1000" \/>/);
  });

  it('should pass Torznab id, music, and book parameters to definitions as Jackett reads them', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    await fetch(
      `${feedUrl}?q=Sample&rid=1&tvdbid=+2&tvmazeid=3&tmdbid=-4&traktid=5&doubanid=6` +
        '&album=Sample+Album&artist=Test+Artist&label=Sample+Label&track=Sample+Track&genre=Drama' +
        '&title=Sample+Book&author=Sample+Author'
    );
    await fetch(`${feedUrl}?q=Sample&author=Sample+Author&publisher=Sample+Publisher&album=%20`);
    const [full, publisher] = receivedOptions;
    assert.deepEqual(
      [full.rageId, full.tvdbId, full.tvmazeId, full.tmdbId, full.traktId, full.doubanId],
      [1, 2, 3, -4, 5, 6]
    );
    assert.deepEqual(
      [full.album, full.artist, full.label, full.track, full.genre, full.title, full.author],
      ['Sample Album', 'Test Artist', 'Sample Label', 'Sample Track', 'Drama', 'Sample Book', 'Sample Author']
    );
    assert.equal(publisher.author, 'Sample Publisher');
    assert.equal(publisher.album, undefined);
  });

  it('should reject a Torznab id that is not an integer on search and caps requests', async () => {
    for (const parameter of ['rid', 'tvdbid', 'tvmazeid', 'tmdbid', 'traktid', 'doubanid']) {
      for (const t of ['caps', 'search']) {
        const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=${t}&${parameter}=abc`);
        assert.equal(res.status, 400, `${t} ${parameter}`);
        assert.match(await res.text(), new RegExp(`<error code="201" description="${parameter} must be an integer"`), `${t} ${parameter}`);
      }
    }
    assert.equal(receivedOptions.length, 0);
  });

  it('should answer tmdbid and tvdbid searches the indexer caps cannot take with error 203', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    const tvRes = await fetch(`${feedUrl}?t=tvsearch&q=Sample&tmdbid=1`);
    assert.equal(tvRes.status, 400);
    assert.match(await tvRes.text(), /<error code="203" description="Function Not Available: tmdbid is not supported for TV search by this indexer"/);
    const movieRes = await fetch(`${feedUrl}?t=movie&q=Sample&tmdbid=1`);
    assert.match(await movieRes.text(), /<error code="203" description="Function Not Available: tmdbid is not supported for movie search by this indexer"/);
    assert.equal(receivedOptions.length, 0);

    const registry = createTestRegistry();
    const rutor = registry.getProvider('rutor') as { searchCaps: TorznabSearchCaps };
    rutor.searchCaps = { ...rutor.searchCaps, modes: { search: ['q'] }, supportsTvImdbSearch: true };
    const testCapsServer = http.createServer(createApp(registry));
    await new Promise<void>(resolve => testCapsServer.listen(0, '127.0.0.1', resolve));
    try {
      const port = (testCapsServer.address() as { port: number }).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/v2.0/indexers/rutor/results/torznab/api?t=tvsearch&imdbid=tt0123456&tvdbid=1`);
      assert.match(await res.text(), /<error code="203" description="Function Not Available: tvdbid is not supported for movie search by this indexer"/);
    } finally {
      await new Promise<void>(resolve => testCapsServer.close(() => resolve()));
    }
  });

  it('should keep Torznab searches that differ only in an id or music parameter apart in the cache', async () => {
    const testCachedServer = http.createServer(createApp(createTestRegistry(), { cache: new MemoryCache<unknown>(60) }));
    await new Promise<void>(resolve => testCachedServer.listen(0, '127.0.0.1', resolve));
    const feedUrl = `http://127.0.0.1:${(testCachedServer.address() as { port: number }).port}/api/v2.0/indexers/rutor/results/torznab/api`;
    try {
      for (const extra of ['', '&tvdbid=1', '&tvdbid=2', '&artist=Test+Artist', '&tvdbid=2']) {
        await fetch(`${feedUrl}?t=search&q=Sample${extra}`);
      }
    } finally {
      await new Promise<void>(resolve => testCachedServer.close(() => resolve()));
    }
    assert.deepEqual(receivedOptions.map(options => [options.tvdbId, options.artist]), [
      [undefined, undefined],
      [1, undefined],
      [2, undefined],
      [undefined, 'Test Artist'],
    ]);
  });

  it('should pass Torznab limit and offset to providers while JSON retains default query values', async () => {
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?q=Sample&limit=-5`);
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?q=Sample`);
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=Sample&limit=5&offset=7`);
    assert.deepEqual(receivedOptions.map(options => [options.limit, options.offset]), [[5, 0], [0, 0], [undefined, undefined]]);
  });

  it('should preserve Torznab category order and duplicates in the definition query', async () => {
    const response = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?cat=5000,2000,5000`);
    assert.equal(response.status, 200);
    assert.deepEqual(receivedOptions[0].categories, [5000, 2000, 5000]);
  });

  it('should require the Jackett IMDb prefix, width, and whitespace rules in Torznab', async () => {
    for (const value of ['TT0123456', '%20tt0123456', 'tt0123456%20', 'tt123456789']) {
      const response = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?imdbid=${value}`);
      assert.equal(response.status, 400, value);
      assert.match(await response.text(), /<error code="201"/);
    }
    assert.equal(receivedOptions.length, 0);
  });

  it('should coerce extended before searches, capabilities, and indexer discovery', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api`;
    for (const value of ['', '%20', 'abc', '-5', '1.5']) {
      const response = await fetch(`${feedUrl}?q=Sample&extended=${value}`);
      assert.equal(response.status, 200, value);
    }
    assert.deepEqual(receivedOptions.map(options => options.extended), [0, 0, 0, 5, 15]);
    for (const t of ['search', 'caps', 'indexers']) {
      const response = await fetch(`${baseUrl}/api/v2.0/indexers/all/results/torznab/api?t=${t}&extended=2147483648`);
      assert.equal(response.status, 400, t);
      assert.match(await response.text(), /<error code="201"/);
    }
  });

  it('should treat whitespace-only Torznab values as absent, as Jackett binds them', async () => {
    const feedUrl = `${baseUrl}/api/v2.0/indexers/kinozal/results/torznab/api`;
    const res = await fetch(`${feedUrl}?t=%20&q=Sample&imdbid=%20&ep=%20&tvdbid=%20&artist=%20`);
    assert.equal(res.status, 200);
    await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=movie&imdbid=tt0123456&cat=%20`);
    const [blank, movie] = receivedOptions;
    assert.deepEqual(
      [blank.searchType, blank.imdbId, blank.episode, blank.tvdbId, blank.artist],
      ['search', undefined, undefined, undefined, undefined]
    );
    assert.deepEqual(movie.categories, [2000]);
  });
});
