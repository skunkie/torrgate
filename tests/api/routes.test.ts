// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { JackettIndexer, JackettSearchResponse } from '../../src/jackett/types.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { SearchOptions } from '../../src/types/provider.js';

describe('Jackett Canonical REST v2.0 API Routes Integration', () => {
  let baseUrl: string;
  let registry: ProviderRegistry;
  let testServer: http.Server;

  before(async () => {
    const httpClient = new HttpClient();
    registry = new ProviderRegistry(httpClient);

    for (const provider of registry.getAllProviders()) {
      Object.defineProperty(provider, 'isConfigured', { configurable: true, value: true });
      provider.searchByTitle = async () => [
        {
          category: 'Video',
          categoryId: 7,
          date: '2024-08-15',
          downloadCount: 10,
          id: '12345',
          leechers: 5,
          magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
          name: 'Пример Релиза / Sample Release',
          seeders: 42,
          size: '1.5 GB',
          sizeBytes: 1610612736,
          torrentUrl: 'https://example.org/download/12345',
          url: 'https://example.org/details/12345',
        },
      ];
      provider.getTopicDetails = async (id: string) => ({
        actors: [],
        audioTranslation: '',
        category: 'Video',
        description: 'Sample topic description',
        director: '',
        duration: '',
        id,
        imdbUrl: '',
        infoHash: '0123456789abcdef0123456789abcdef01234567',
        kinopoiskUrl: '',
        magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
        name: 'Пример Релиза / Sample Release',
        posterUrl: '',
        releaseCountry: '',
        torrentUrl: 'https://example.org/download/12345',
        url: `https://example.org/details/${id}`,
        year: '2024',
      });
    }

    const app = createApp(registry);

    await new Promise<void>(resolve => {
      testServer = app.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => {
      testServer.close(() => resolve());
    });
  });

  it('should give JSON results and Torznab items the release GUID Jackett assigns, once per indexer', async () => {
    const provider = registry.getProvider('rutor')!;
    const originalSearch = provider.searchByTitle;
    const sampleItem = {
      category: 'Video',
      date: '2024-08-15',
      downloadCount: 0,
      id: '7',
      leechers: 0,
      name: 'Sample Release',
      seeders: 1,
      size: '1 GB',
      torrentUrl: 'https://tracker.example/download/7',
      url: 'https://tracker.example/details/7',
    };
    provider.searchByTitle = async () => [
      sampleItem,
      { ...sampleItem, id: '8', magnetUri: 'magnet:?xt=urn:btih:sample', torrentUrl: '', url: 'https://tracker.example/details/8' },
      { ...sampleItem, id: '9', url: 'https://tracker.example/details/9' },
    ];

    try {
      for (const route of ['rutor/results?Query=guid-sample', 'all/results?Tracker[]=rutor&Query=guid-sample']) {
        const data = (await (await fetch(`${baseUrl}/api/v2.0/indexers/${route}`)).json()) as JackettSearchResponse;
        assert.deepEqual(data.Results.map(result => result.Guid), ['https://tracker.example/download/7', 'magnet:?xt=urn:btih:sample'], route);
      }

      const feed = await (await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=guid-sample`)).text();
      const guids = [...feed.matchAll(/<guid>([^<]+)<\/guid>/g)].map(m => m[1]);
      assert.deepEqual(guids, ['https://tracker.example/download/7', 'magnet:?xt=urn:btih:sample']);
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should serialize JSON release metadata with Jackett names, values, and null defaults', async () => {
    const provider = registry.getProvider('rutor')!;
    const originalSearch = provider.searchByTitle;
    const sampleItem = {
      category: '1',
      date: '2024-08-15',
      id: 'metadata',
      leechers: 5,
      magnetUri: 'magnet:?xt=urn:btih:aBcDEF',
      name: 'Sample Release',
      seeders: 7,
      size: '',
      sizeBytes: 123456789,
      torrentUrl: '',
      url: 'https://tracker.example/details/metadata',
    };
    provider.searchByTitle = async () => [sampleItem];
    try {
      const url = `${baseUrl}/api/v2.0/indexers/rutor/results`;
      const empty = (await (await fetch(url)).json() as JackettSearchResponse).Results[0];
      assert.deepEqual(empty, {
        Album: null,
        Artist: null,
        Author: null,
        BlackholeLink: null,
        BookTitle: null,
        Category: [2000, 100001],
        CategoryDesc: 'Movies',
        Description: null,
        Details: sampleItem.url,
        DoubanId: null,
        DownloadVolumeFactor: null,
        Files: null,
        FirstSeen: '0001-01-01T00:00:00',
        Gain: 7 * (123456789 / 1024 / 1024 / 1024),
        Genres: null,
        Grabs: null,
        Guid: sampleItem.magnetUri,
        Imdb: null,
        InfoHash: 'aBcDEF',
        Label: null,
        Languages: [],
        Link: null,
        MagnetUri: sampleItem.magnetUri,
        MinimumRatio: null,
        MinimumSeedTime: null,
        Peers: 5,
        Poster: null,
        PublishDate: '2024-08-15T00:00:00.000Z',
        Publisher: null,
        RageID: null,
        Seeders: 7,
        Size: 123456789,
        Subs: [],
        TMDb: null,
        TVDBId: null,
        TVMazeId: null,
        Title: sampleItem.name,
        Track: null,
        Tracker: provider.name,
        TrackerId: 'rutor',
        TrackerType: 'public',
        TraktId: null,
        UploadVolumeFactor: null,
        Year: null,
      });
      provider.searchByTitle = async () => [{
        ...sampleItem,
        album: 'Sample Album',
        artist: 'Test Artist',
        author: 'Sample Author',
        bookTitle: 'Sample Book',
        doubanId: 1,
        downloadVolumeFactor: 0,
        files: 0,
        genres: ['Drama'],
        imdbId: 'tt0123456',
        infoHash: 'ExactHash',
        label: 'Sample Label',
        minimumRatio: 0,
        minimumSeedTimeSeconds: 0,
        publisher: 'Sample Publisher',
        rageId: 2,
        tmdbId: 3,
        track: 'Sample Track',
        traktId: 4,
        tvdbId: 5,
        tvmazeId: 6,
        uploadVolumeFactor: 0,
        year: 2024,
      }];
      const full = (await (await fetch(url)).json() as JackettSearchResponse).Results[0];
      assert.deepEqual(full, {
        ...empty,
        Album: 'Sample Album',
        Artist: 'Test Artist',
        Author: 'Sample Author',
        BookTitle: 'Sample Book',
        DoubanId: 1,
        DownloadVolumeFactor: 0,
        Files: 0,
        Genres: ['Drama'],
        Imdb: 123456,
        InfoHash: 'ExactHash',
        Label: 'Sample Label',
        MinimumRatio: 0,
        MinimumSeedTime: 0,
        Publisher: 'Sample Publisher',
        RageID: 2,
        TMDb: 3,
        TVDBId: 5,
        TVMazeId: 6,
        Track: 'Sample Track',
        TraktId: 4,
        UploadVolumeFactor: 0,
        Year: 2024,
      });
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should report missing JSON sizes and grabs as null and keep zero grabs, as Jackett does', async () => {
    const provider = registry.getProvider('rutor')!;
    const originalSearch = provider.searchByTitle;
    provider.searchByTitle = async () => [{
      category: 'Video',
      date: '2024-08-15',
      id: '11',
      leechers: 0,
      name: 'Sample Unsized Release',
      seeders: 3,
      size: '',
      torrentUrl: 'https://tracker.example/download/11',
      url: 'https://tracker.example/details/11',
    }, {
      category: 'Video',
      date: '2024-08-15',
      downloadCount: 0,
      id: '12',
      leechers: 0,
      name: 'Sample Ungrabbed Release',
      seeders: 1,
      size: '1 GB',
      sizeBytes: 1073741824,
      torrentUrl: 'https://tracker.example/download/12',
      url: 'https://tracker.example/details/12',
    }];

    try {
      const data = (await (await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=unsized-sample`)).json()) as JackettSearchResponse;
      assert.deepEqual(data.Results.map(result => [result.Size, result.Gain, result.Grabs]), [[null, null, null], [1073741824, 1, 0]]);
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should serialize every Kinozal category mapping in JSON results and Torznab feeds', async () => {
    const provider = registry.getProvider('kinozal')!;
    const originalSearch = provider.searchByTitle;
    provider.searchByTitle = async options => (await originalSearch(options)).map(item => ({ ...item, category: '21' }));

    try {
      const response = await fetch(`${baseUrl}/api/v2.0/indexers/kinozal/results?cat=2000`);
      assert.equal(response.status, 200);
      const data = (await response.json()) as JackettSearchResponse;
      assert.deepEqual(data.Results[0].Category, [5000, 100021, 2000]);

      const feedResponse = await fetch(`${baseUrl}/api/v2.0/indexers/kinozal/results/torznab/api?t=search&cat=2000&limit=1`);
      assert.equal(feedResponse.status, 200);
      const xml = await feedResponse.text();
      const categories = [...xml.matchAll(/<torznab:attr name="category" value="(\d+)" \/>/g)]
        .map(match => Number(match[1]));
      assert.deepEqual(categories, [5000, 100021, 2000]);
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should expose declared search descriptions and posters through Jackett JSON fields', async () => {
    const provider = registry.getProvider('newstudio')!;
    const originalSearch = provider.searchByTitle;
    provider.searchByTitle = async options => (await originalSearch(options)).map(item => ({
      ...item,
      description: 'Тестовое описание / Sample release notes',
      posterUrl: 'https://tracker.example.test/posters/sample.jpg',
    }));
    try {
      for (const route of ['newstudio/results', 'newstudio/results?limit=1', 'all/results?Tracker[]=newstudio']) {
        const response = await fetch(`${baseUrl}/api/v2.0/indexers/${route}`);
        assert.equal(response.status, 200);
        const data = await response.json() as JackettSearchResponse;
        assert.equal(data.Results[0].Description, 'Тестовое описание / Sample release notes');
        assert.equal(data.Results[0].Poster, 'https://tracker.example.test/posters/sample.jpg');
      }
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('should expose direct magnets for releases without a torrent download', async () => {
    const provider = registry.getProvider('rutracker-ru')!;
    const originalSearch = provider.searchByTitle;
    provider.searchByTitle = async options => (await originalSearch(options)).map(item => ({ ...item, torrentUrl: '' }));
    try {
      const response = await fetch(`${baseUrl}/api/v2.0/indexers/rutracker-ru/results`);
      assert.equal(response.status, 200);
      const data = await response.json() as JackettSearchResponse;
      assert.equal(data.Results[0].Link, null);
      assert.match(data.Results[0].MagnetUri ?? '', /^magnet:/);

      const feed = await fetch(`${baseUrl}/api/v2.0/indexers/rutracker-ru/results/torznab/api?limit=1`);
      assert.equal(feed.status, 200);
      const xml = await feed.text();
      assert.match(xml, /<enclosure url="magnet:\?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"/);
    } finally {
      provider.searchByTitle = originalSearch;
    }
  });

  it('GET /api/v2.0/indexers should return all registered indexers in Jackett format', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as JackettIndexer[];
    assert.equal(Array.isArray(data), true);
    assert.equal(data.length, registry.getAllProviders().length);

    const names = data.map(p => p.name).sort();
    assert.deepEqual(names, [
      'BigFANGroup',
      'Kinozal',
      'MegaPeer',
      'NewStudio',
      'NoNaMe Club',
      'RuTor',
      'RuTracker.RU',
      'RuTracker.org',
      'torrent.by',
    ]);
    const ids = data.map(p => p.id).sort();
    assert.deepEqual(ids, [
      'bigfangroup',
      'kinozal',
      'megapeer',
      'newstudio',
      'noname-club',
      'rutor',
      'rutracker',
      'rutracker-ru',
      'torrentby',
    ]);
    assert.equal(data[0]?.configured, true);
    assert.ok(data[0]?.site_link);

    const byId = Object.fromEntries(data.map(idx => [idx.id, idx.type]));
    assert.equal(byId['kinozal'], 'semi-private');
    assert.equal(byId['rutracker-ru'], 'public');
    assert.equal(byId['rutracker'], 'semi-private');
    assert.equal(byId['rutor'], 'public');
    assert.equal(byId['noname-club'], 'public');
    assert.equal(byId['megapeer'], 'public');
    assert.equal(byId['bigfangroup'], 'public');
    assert.equal(byId['newstudio'], 'public');
    assert.equal(byId['torrentby'], 'public');
  });

  it('GET /api/v2.0/indexers/all/results should return search envelope with Results and Indexers', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/all/results?Query=test`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as JackettSearchResponse;
    assert.ok(Array.isArray(data.Results));
    assert.ok(Array.isArray(data.Indexers));
    assert.equal(data.Indexers.length, registry.getAllProviders().length);
    assert.ok(data.Results[0]?.Link?.startsWith(baseUrl));
    assert.equal(data.Results[0].Poster, null);

    const indexerIds = data.Indexers.map(idx => idx.ID).sort();
    assert.deepEqual(indexerIds, [
      'bigfangroup',
      'kinozal',
      'megapeer',
      'newstudio',
      'noname-club',
      'rutor',
      'rutracker',
      'rutracker-ru',
      'torrentby',
    ]);

    // Check Jackett ManualSearchResultIndexerStatus enum: 2 = OK
    for (const idx of data.Indexers) {
      assert.equal(idx.Status, 2);
      assert.equal(typeof idx.ElapsedTime, 'number');
      assert.ok((idx.ElapsedTime ?? -1) >= 0);
    }

    const rutrackerResult = data.Results.find(r => r.TrackerId === 'rutracker-ru');
    assert.equal(rutrackerResult?.TrackerType, 'public');
    assert.equal(rutrackerResult?.Peers, 5);
    assert.ok((rutrackerResult?.Gain ?? 0) > 0);

    const rutorResult = data.Results.find(r => r.TrackerId === 'rutor');
    assert.equal(rutorResult?.TrackerType, 'public');
  });

  it('GET /api/v2.0/indexers/all/results with Tracker[] should filter indexers', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/all/results?Tracker[]=rutor&Query=test`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as JackettSearchResponse;
    assert.equal(data.Indexers.length, 1);
    assert.equal(data.Indexers[0]?.ID, 'rutor');
  });

  it('GET /api/v2.0/indexers/rutor/results with Category[] should parse category array', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Category[]=2000&Category[]=5000&Query=test`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as JackettSearchResponse;
    assert.equal(data.Indexers[0]?.Status, 2);
  });

  it('GET /api/v2.0/indexers/rutor/results/torznab should support Torznab endpoint without /api suffix', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab?t=caps`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/xml/);

    const text = await res.text();
    assert.match(text, /<caps>/);
  });

  it('GET /api/v2.0/indexers/rutor/results/torznab/api?t=caps should return Torznab caps XML', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=caps`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/xml/);

    const text = await res.text();
    assert.match(text, /<caps>/);
    assert.match(text, /<server title="TorrGate" \/>/);
  });

  it('GET /api/v2.0/indexers/rutor/results/torznab/api?t=search should return Torznab RSS XML with absolute links and enclosures', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=test`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/xml/);

    const text = await res.text();
    assert.match(text, /<rss version="2\.0"/);
    assert.match(text, /xmlns:torznab="http:\/\/torznab\.com\/schemas\/2015\/feed"/);
    assert.ok(text.includes(`<link>${baseUrl}/api/v2.0/indexers/rutor/download?url=`));
    assert.match(text, /<enclosure url=/);
    assert.match(text, /<jackettindexer id="rutor">/);
  });

  it('should return details for the topic ID in the route', async () => {
    for (const query of ['', '?query=54321&Query=65432&id=76543']) {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/details/12345${query}`);
      assert.equal(res.status, 200);

      const data = (await res.json()) as { id: string; name: string }[];
      assert.equal(Array.isArray(data), true);
      assert.equal(data[0]?.id, '12345');
      assert.equal(data[0]?.name, 'Пример Релиза / Sample Release');
    }
  });

  it('GET /api/v2.0/indexers/rutracker-ru/categories should return RuTracker categories', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutracker-ru/categories`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as { id: number; name: string }[];
    assert.equal(Array.isArray(data), true);
    assert.ok(data.length > 0);
  });

  it('GET /api/v2.0/indexers/unknown/categories should return 404', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/unknown/categories`);
    assert.equal(res.status, 404);
  });

  it('GET /api/v2.0/indexers/unknown/results should return 404', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/unknown/results?Query=test`);
    assert.equal(res.status, 404);
  });

  it('GET /api/v2.0/indexers/rutor/details with a path-like topic id should return 400', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/details/..%2F..%2Flogout`);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { message: string };
    assert.match(body.message, /Topic ID may only contain/);
  });

  it('GET /api/v2.0/indexers/unknown/details/12345 should return 404', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/unknown/details/12345`);
    assert.equal(res.status, 404);
  });

  it('GET /api/v2.0/indexers/openapi.yaml should return the raw OpenAPI spec', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/openapi.yaml`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/yaml/);

    const text = await res.text();
    assert.match(text, /openapi: 3\.1\.0/);
    assert.match(text, /title: TorrGate API/);
    assert.match(text, /url: \/api\/v2\.0\/indexers/);
    assert.doesNotMatch(text, /localhost/);
  });

  it('GET / should return the web client application HTML with CSP', async () => {
    const resRoot = await fetch(`${baseUrl}/`);
    assert.equal(resRoot.status, 200);
    assert.match(resRoot.headers.get('content-type') || '', /text\/html/);
    assert.match(resRoot.headers.get('content-security-policy') || '', /default-src 'self'/);
    const rootHtml = await resRoot.text();
    assert.match(rootHtml, /TorrGate/);
    assert.match(rootHtml, /id="query-input"/);
  });

  it('GET /docs and /api/v2.0/indexers/docs should return interactive API documentation HTML with CSP', async () => {
    const resDocs = await fetch(`${baseUrl}/docs`);
    assert.equal(resDocs.status, 200);
    assert.match(resDocs.headers.get('content-type') || '', /text\/html/);
    assert.match(resDocs.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.match(resDocs.headers.get('content-security-policy') || '', /worker-src 'self' blob:/);
    assert.match(resDocs.headers.get('content-security-policy') || '', /connect-src 'self';/);

    const html = await resDocs.text();
    assert.match(html, /<html lang="en">/);
    assert.match(html, /TorrGate API Reference/);
    assert.match(html, /scalar/);

    const resAlias = await fetch(`${baseUrl}/api/v2.0/indexers/docs`);
    assert.equal(resAlias.status, 200);
    assert.match(resAlias.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.match(await resAlias.text(), /<html lang="en">/);
  });

  it('GET /api/v2.0/indexers/nonexistent should return 404', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/nonexistent`);
    assert.equal(res.status, 404);
  });

  it('GET /api/v2.0/indexers/:indexer/results should reject invalid indexer format with 400', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/invalid%20name!/results?Query=test`);
    assert.equal(res.status, 400);
  });

  it('GET /api/v2.0/indexers/:indexer/results should report an upstream search failure in the JSON envelope', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    rutorProvider.searchByTitle = async () => {
      throw new Error('Connection refused by upstream');
    };

    try {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=test`);
      assert.equal(res.status, 200);
      const data = await res.json() as JackettSearchResponse;
      assert.deepEqual(data.Results, []);
      assert.equal(data.Indexers[0].Status, 1);
      assert.equal(data.Indexers[0].ElapsedTime, 0);
      assert.match(data.Indexers[0].Error ?? '', /Connection refused/);
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('GET /api/v2.0/indexers/:indexer/results/torznab/api should return 502 on upstream failure', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    rutorProvider.searchByTitle = async () => {
      throw new Error('Upstream timeout');
    };

    try {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?q=test`);
      assert.equal(res.status, 502);
      const text = await res.text();
      assert.match(text, /<error code="900" /);
      assert.match(text, /Upstream timeout/);
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('OPTIONS /api/v2.0/indexers should respond with 204 and CORS headers', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers`, {
      method: 'OPTIONS',
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(res.headers.get('access-control-allow-methods') || '', /OPTIONS/);
    assert.match(res.headers.get('access-control-allow-headers') || '', /\bAuthorization\b/);
    assert.match(res.headers.get('access-control-allow-headers') || '', /\bX-Api-Key\b/);
  });

  it('GET /api/v2.0/indexers/rutor/results/torznab/api?t=tvsearch should pass season and ep beside the query', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    let receivedOptions: SearchOptions | undefined;
    rutorProvider.searchByTitle = async options => {
      receivedOptions = options;
      return [];
    };

    try {
      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=tvsearch&q=Sample+Show&season=1&ep=2`
      );
      assert.equal(res.status, 200);
      assert.deepEqual(
        [receivedOptions?.query, receivedOptions?.season, receivedOptions?.episode],
        ['Sample Show', 1, '2']
      );
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('GET /api/v2.0/indexers/rutor/details/:id should return 502 when provider throws', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalDetails = rutorProvider.getTopicDetails;
    rutorProvider.getTopicDetails = async () => {
      throw new Error('Upstream topic parsing failed');
    };

    try {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/details/99999`);
      assert.equal(res.status, 502);
      const data = (await res.json()) as { error: string; message: string };
      assert.equal(data.error, 'BadGateway');
    } finally {
      rutorProvider.getTopicDetails = originalDetails;
    }
  });
});
