// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { JackettIndexer, JackettSearchResponse } from '../../src/types/jackett.js';

describe('Jackett Canonical REST v2.0 API Routes Integration', () => {
  let baseUrl: string;
  let registry: ProviderRegistry;
  let server: http.Server;

  before(async () => {
    const httpClient = new HttpClient();
    registry = new ProviderRegistry(httpClient);

    for (const provider of registry.getAllProviders()) {
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
      provider.searchPageByTitle = undefined;
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
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  });

  it('GET /api/v2.0/indexers should return all registered indexers in Jackett format', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as JackettIndexer[];
    assert.equal(Array.isArray(data), true);
    assert.equal(data.length, 8);

    const names = data.map(p => p.name).sort();
    assert.deepEqual(names, [
      'BigFANGroup',
      'Kinozal',
      'MegaPeer',
      'NewStudio',
      'NoNaMe Club',
      'RuTor',
      'RuTracker.RU',
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
      'rutracker-ru',
      'torrentby',
    ]);
    assert.equal(data[0]?.configured, true);
    assert.ok(data[0]?.site_link);

    const byId = Object.fromEntries(data.map(idx => [idx.id, idx.type]));
    assert.equal(byId['kinozal'], 'semi-private');
    assert.equal(byId['rutracker-ru'], 'semi-private');
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
    assert.equal(data.Indexers.length, 8);
    assert.ok(data.Results[0]?.Link?.startsWith(baseUrl));

    const indexerIds = data.Indexers.map(idx => idx.ID).sort();
    assert.deepEqual(indexerIds, [
      'bigfangroup',
      'kinozal',
      'megapeer',
      'newstudio',
      'noname-club',
      'rutor',
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
    assert.equal(rutrackerResult?.TrackerType, 'semi-private');
    assert.equal(rutrackerResult?.Peers, 47); // Total peers = Seeders (42) + Leechers (5)
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
    assert.match(text, /<server version="1\.0" title="TorrGate" \/>/);
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

  it('GET /api/v2.0/indexers/rutor/details/12345 should return topic details', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/details/12345`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as { id: string; name: string }[];
    assert.equal(Array.isArray(data), true);
    assert.equal(data[0]?.id, '12345');
    assert.equal(data[0]?.name, 'Пример Релиза / Sample Release');
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
    assert.match(html, /TorrGate API Reference/);
    assert.match(html, /scalar/);

    const resAlias = await fetch(`${baseUrl}/api/v2.0/indexers/docs`);
    assert.equal(resAlias.status, 200);
    assert.match(resAlias.headers.get('content-security-policy') || '', /default-src 'self'/);
  });

  it('GET /api/v2.0/indexers/nonexistent should return 404', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/nonexistent`);
    assert.equal(res.status, 404);
  });

  it('GET /api/v2.0/indexers/:indexer/results should reject invalid indexer format with 400', async () => {
    const res = await fetch(`${baseUrl}/api/v2.0/indexers/invalid%20name!/results?Query=test`);
    assert.equal(res.status, 400);
  });

  it('GET /api/v2.0/indexers/:indexer/results should return 502 on upstream search failure', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    rutorProvider.searchByTitle = async () => {
      throw new Error('Connection refused by upstream');
    };

    try {
      const res = await fetch(`${baseUrl}/api/v2.0/indexers/rutor/results?Query=test`);
      assert.equal(res.status, 502);
      const data = (await res.json()) as { error: string; message: string };
      assert.equal(data.error, 'BadGateway');
      assert.match(data.message, /Connection refused/);
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

  it('GET /api/v2.0/indexers/rutor/results/torznab/api?t=tvsearch should format season and ep into query', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    let receivedQuery = '';
    rutorProvider.searchByTitle = async options => {
      receivedQuery = options.query;
      return [];
    };

    try {
      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=tvsearch&q=Sample+Show&season=1&ep=2`
      );
      assert.equal(res.status, 200);
      assert.equal(receivedQuery, 'Sample Show S01E02');
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('GET /api/v2.0/indexers/rutor/results/torznab/api with offset and limit should return that window of results', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    const requestedPages: number[] = [];
    const pageSize = 20;
    rutorProvider.searchByTitle = async options => {
      const page = options.page ?? 0;
      requestedPages.push(page);
      return Array.from({ length: pageSize }, (_, index) => {
        const position = page * pageSize + index;
        return {
          category: 'Video',
          date: '2024-08-15',
          downloadCount: 0,
          id: String(position),
          leechers: 0,
          name: `Sample Release ${position}`,
          seeders: 1,
          size: '1 GB',
          torrentUrl: `https://example.org/download/${position}`,
          url: `https://example.org/details/${position}`,
        };
      });
    };

    try {
      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/rutor/results/torznab/api?t=search&q=window-sample&offset=50&limit=25`
      );
      assert.equal(res.status, 200);
      const titles = [...(await res.text()).matchAll(/<title>Sample Release (\d+)<\/title>/g)].map(m => Number(m[1]));
      assert.deepEqual(titles, Array.from({ length: 25 }, (_, index) => 50 + index));
      assert.deepEqual(requestedPages, [0, 1, 2, 3]);
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('GET /api/v2.0/indexers/rutor/results with offset and limit should return that result window', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    const requestedPages: number[] = [];
    const pageSize = 20;
    rutorProvider.searchByTitle = async options => {
      const page = options.page ?? 0;
      requestedPages.push(page);
      return Array.from({ length: pageSize }, (_, index) => {
        const position = page * pageSize + index;
        return {
          category: 'Video',
          date: '2024-08-15',
          downloadCount: 0,
          id: String(position),
          leechers: 0,
          name: `Sample Release ${position}`,
          seeders: 1,
          size: '1 GB',
          torrentUrl: `https://example.org/download/${position}`,
          url: `https://example.org/details/${position}`,
        };
      });
    };

    try {
      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/rutor/results?Query=test&offset=60&limit=20`
      );
      assert.equal(res.status, 200);
      const data = (await res.json()) as JackettSearchResponse;
      assert.deepEqual(
        data.Results.map(result => result.Title),
        Array.from({ length: 20 }, (_, index) => `Sample Release ${60 + index}`)
      );
      assert.deepEqual(requestedPages, [0, 1, 2, 3]);
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('GET /api/v2.0/indexers/all/results should apply a result window after tracker filtering', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    rutorProvider.searchByTitle = async ({ page = 0 }) =>
      Array.from({ length: 3 }, (_, index) => {
        const position = page * 3 + index;
        return {
          category: 'Video',
          date: '2024-08-15',
          downloadCount: 0,
          id: String(position),
          leechers: 0,
          name: `Aggregate Sample Release ${position}`,
          seeders: 1,
          size: '1 GB',
          torrentUrl: `https://example.org/download/${position}`,
          url: `https://example.org/details/${position}`,
        };
      });

    try {
      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/all/results?Query=test&Tracker[]=rutor&offset=4&limit=3`
      );
      assert.equal(res.status, 200);
      const data = (await res.json()) as JackettSearchResponse;
      assert.deepEqual(data.Results.map(result => result.Title), [
        'Aggregate Sample Release 4',
        'Aggregate Sample Release 5',
        'Aggregate Sample Release 6',
      ]);
      assert.deepEqual(data.Indexers.map(indexer => indexer.ID), ['rutor']);
      assert.equal(data.Indexers[0]?.Results, 3);
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('GET /api/v2.0/indexers/rutor/results should reject an unbounded deep result window', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    rutorProvider.searchByTitle = async ({ page = 0 }) => [
      {
        category: 'Video',
        date: '2024-08-15',
        downloadCount: 0,
        id: String(page),
        leechers: 0,
        name: `Deep Sample Release ${page}`,
        seeders: 1,
        size: '1 GB',
        torrentUrl: `https://example.org/download/${page}`,
        url: `https://example.org/details/${page}`,
      },
    ];

    try {
      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/rutor/results?Query=test&offset=50&limit=1`
      );
      assert.equal(res.status, 502);
      const data = (await res.json()) as { error: string; message: string };
      assert.equal(data.error, 'BadGateway');
      assert.match(data.message, /page-round limit/);
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('GET /api/v2.0/indexers/rutor/results with Page should retain native page semantics', async () => {
    const rutorProvider = registry.getProvider('rutor');
    assert.ok(rutorProvider);
    const originalSearch = rutorProvider.searchByTitle;
    let receivedPage: number | undefined;
    rutorProvider.searchByTitle = async options => {
      receivedPage = options.page;
      return [];
    };

    try {
      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/rutor/results?Query=test&Page=5`
      );
      assert.equal(res.status, 200);
      assert.equal(receivedPage, 5);
    } finally {
      rutorProvider.searchByTitle = originalSearch;
    }
  });

  it('GET /api/v2.0/indexers/rutor/results should reject invalid pagination and format values', async () => {
    const invalidQueries = [
      'offset=invalid',
      'limit=xyz',
      'offset=-1',
      'limit=-1',
      'Page=-1',
      'Page=2junk',
      'format=999',
      'offset=1&limit=9007199254740991',
    ];

    for (const invalidQuery of invalidQueries) {
      const res = await fetch(
        `${baseUrl}/api/v2.0/indexers/rutor/results?Query=test&${invalidQuery}`
      );
      assert.equal(res.status, 400, invalidQuery);
      const data = (await res.json()) as { error: string };
      assert.equal(data.error, 'BadRequest', invalidQuery);
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
