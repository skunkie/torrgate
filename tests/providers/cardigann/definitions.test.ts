// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it, mock } from 'node:test';

import iconv from 'iconv-lite';

import { HttpClient } from '../../../src/http/http-client.js';
import { loadDefinitionsFromDir } from '../../../src/providers/cardigann/loader.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { parseToIsoString } from '../../../src/utils/date.js';
import { testBigFanGroupSearchHtml } from '../../fixtures/bigfangroup.fixture.js';
import { testKinozalSearchHtml } from '../../fixtures/kinozal.fixture.js';
import { testMegaPeerSearchHtml } from '../../fixtures/megapeer.fixture.js';
import { testNewStudioSearchHtml } from '../../fixtures/newstudio.fixture.js';
import { testNoNameClubSearchHtml } from '../../fixtures/nonameclub.fixture.js';
import { testRuTorSearchHtml } from '../../fixtures/rutor.fixture.js';
import { testRuTrackerSearchHtml } from '../../fixtures/rutracker.fixture.js';
import { testTorrentBySearchHtml } from '../../fixtures/torrentby.fixture.js';

describe('Jackett Cardigann Definitions Compatibility', () => {
  let baseUrl: string;
  let httpClient: HttpClient;
  let providers: CardigannProvider[];
  let testServer: http.Server;

  before(async () => {
    testServer = http.createServer((req, res) => {
      const url = req.url || '';

      if (url.includes('/rutracker/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(testRuTrackerSearchHtml);
      } else if (url.includes('/kinozal/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=windows-1251' });
        res.end(iconv.encode(testKinozalSearchHtml, 'win1251'));
      } else if (url.includes('/nonameclub/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=windows-1251' });
        res.end(iconv.encode(testNoNameClubSearchHtml, 'win1251'));
      } else if (url.includes('/megapeer/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=windows-1251' });
        res.end(iconv.encode(testMegaPeerSearchHtml, 'win1251'));
      } else if (url.includes('/bigfangroup/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=windows-1251' });
        res.end(iconv.encode(testBigFanGroupSearchHtml, 'win1251'));
      } else if (url.includes('/newstudio/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(url.includes('start=50') ? '<table></table>' : testNewStudioSearchHtml);
      } else if (url.includes('/torrentby/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(testTorrentBySearchHtml);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(testRuTorSearchHtml);
      }
    });

    await new Promise<void>(resolve => {
      testServer.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    httpClient = new HttpClient();
    const definitionsDir = path.resolve(process.cwd(), 'definitions');
    providers = loadDefinitionsFromDir(definitionsDir, httpClient);
  });

  after(async () => {
    await new Promise<void>(resolve => {
      testServer.close(() => resolve());
    });
  });

  it('should load all target definitions', () => {
    const ids = providers.map(p => p.definition.id || p.definition.site).sort();
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
  });

  it('should parse RuTor search results using Cardigann definition', async () => {
    const rutorDef = providers.find(p => (p.definition.id || p.definition.site) === 'rutor')!;
    assert.ok(rutorDef);

    const testProvider = new CardigannProvider(
      {
        ...rutorDef.definition,
        links: [`${baseUrl}/rutor/`],
      },
      httpClient
    );

    const results = await testProvider.searchByTitle({ query: 'Example' });
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 1);
    assert.equal(results.some(r => r.name.includes('Новость')), false);
    const [firstResult] = results;
    assert.ok(firstResult);
    assert.equal(firstResult.id, '300001');
    assert.match(firstResult.name, /Пример Релиза \/ Example Release/);
    assert.equal(firstResult.seeders, 320);
    assert.equal(firstResult.leechers, 15);
    assert.ok((firstResult.sizeBytes ?? 0) > 0);
    const magnet = new URL(firstResult.magnetUri!);
    assert.equal(magnet.searchParams.get('xt'), 'urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01');
    assert.deepEqual(magnet.searchParams.getAll('tr'), rutorDef.definition.trackers);
  });

  it('should parse RuTracker search results using Cardigann definition', async () => {
    const rutrackerDef = providers.find(
      p => (p.definition.id || p.definition.site) === 'rutracker-ru'
    )!;
    assert.ok(rutrackerDef);
    assert.equal(rutrackerDef.encoding, 'utf-8');
    assert.deepEqual(rutrackerDef.urls, ['http://rutracker.ru/']);

    const testProvider = new CardigannProvider(
      {
        ...rutrackerDef.definition,
        links: [`${baseUrl}/rutracker/`],
      },
      httpClient
    );

    const results = await testProvider.searchByTitle({ query: 'Example' });
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 2);
    assert.match(results[0].name, /Пример Фильма \/ Example Movie/);
    assert.equal(results[0].seeders, 150);
    assert.equal(results[0].leechers, 12);
    assert.equal(results[0].id, '100001');
    assert.equal(results[0].torrentUrl, '');
    assert.match(results[0].magnetUri ?? '', /^magnet:\?xt=urn:btih:/);
  });

  it('should parse Kinozal search results using Cardigann definition', async () => {
    const kinozalDef = providers.find(p => (p.definition.id || p.definition.site) === 'kinozal')!;
    assert.ok(kinozalDef);
    assert.equal(kinozalDef.encoding, 'windows-1251');

    const testProvider = new CardigannProvider(
      {
        ...kinozalDef.definition,
        links: [`${baseUrl}/kinozal/`],
      },
      httpClient
    );

    const results = await testProvider.searchByTitle({ query: 'Fictional' });
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 2);
    assert.match(results[0].name, /Fictional Film/);
    assert.equal(results[0].seeders, 90);
    assert.equal(results[0].leechers, 8);
    assert.equal(results[0].category, '13');
    assert.equal(results[1].category, '46');
  });

  it('should filter Kinozal results by standard and tracker categories', async () => {
    const definition = providers.find(provider => provider.id === 'kinozal')!.definition;
    const testProvider = new CardigannProvider(
      { ...definition, links: [`${baseUrl}/kinozal/`] },
      httpClient
    );

    for (const category of [2000, 100013]) {
      const results = await testProvider.searchByTitle({ categories: [category], query: 'Sample' });
      assert.deepEqual(results.map(result => result.id), ['200001']);
    }
    const results = await testProvider.searchByTitle({ categories: [5000], query: 'Sample' });
    assert.deepEqual(results.map(result => result.id), ['200002']);
  });

  it('should parse NoNameClub search results using Cardigann definition', async () => {
    const nnmDef = providers.find(p => (p.definition.id || p.definition.site) === 'noname-club')!;
    assert.ok(nnmDef);

    const testProvider = new CardigannProvider(
      {
        ...nnmDef.definition,
        links: [`${baseUrl}/nonameclub/`],
      },
      httpClient
    );

    const results = await testProvider.searchByTitle({ query: 'Synthetic' });
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 1);
    assert.match(results[0].name, /Синтетический Фильм \/ Synthetic Movie/);
    assert.equal(results[0].seeders, 210);
    assert.equal(results[0].leechers, 18);
  });

  it('should parse MegaPeer search results using Cardigann definition', async () => {
    const megapeerDef = providers.find(p => (p.definition.id || p.definition.site) === 'megapeer')!;
    assert.ok(megapeerDef);
    assert.equal(megapeerDef.encoding, 'windows-1251');

    const testProvider = new CardigannProvider(
      {
        ...megapeerDef.definition,
        links: [`${baseUrl}/megapeer/`],
      },
      httpClient
    );

    const results = await testProvider.searchByTitle({ query: 'Example' });
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 1);
    assert.match(results[0].name, /Пример Фильма \/ Example Movie/);
    assert.equal(results[0].seeders, 150);
    assert.equal(results[0].leechers, 10);
    assert.equal(results[0].size, '1.45 GB');
  });

  it('should include unclassified MegaPeer releases only in matching category searches', async () => {
    const definition = providers.find(provider => provider.id === 'megapeer')!.definition;
    const httpClient = new HttpClient();
    httpClient.getDecoded = async () => testMegaPeerSearchHtml;
    const provider = new CardigannProvider(definition, httpClient);

    for (const category of [8000, 8010, 100169]) {
      const results = await provider.searchByTitle({ categories: [category], query: 'Example' });
      assert.equal(results.length, 1);
      assert.equal(results[0].category, '169');
    }
    for (const category of [2000, 5000, 100079]) {
      assert.deepEqual(await provider.searchByTitle({ categories: [category], query: 'Example' }), []);
    }
  });

  it('should parse BigFANGroup search results using Cardigann definition', async () => {
    const bfgDef = providers.find(p => (p.definition.id || p.definition.site) === 'bigfangroup')!;
    assert.ok(bfgDef);
    assert.equal(bfgDef.encoding, 'windows-1251');

    const testProvider = new CardigannProvider(
      {
        ...bfgDef.definition,
        links: [`${baseUrl}/bigfangroup/`],
      },
      httpClient
    );

    const results = await testProvider.searchByTitle({ query: 'Action' });
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 1);
    assert.match(results[0].name, /Вымышленный Боевик \/ Fictional Action/);
    assert.equal(results[0].seeders, 80);
    assert.equal(results[0].leechers, 5);
    assert.equal(results[0].category, '13');
  });

  it('should parse NewStudio search results using Cardigann definition', async () => {
    const newstudioDef = providers.find(
      p => (p.definition.id || p.definition.site) === 'newstudio'
    )!;
    assert.ok(newstudioDef);
    assert.equal(newstudioDef.encoding, 'utf-8');

    const testProvider = new CardigannProvider(
      {
        ...newstudioDef.definition,
        links: [`${baseUrl}/newstudio/`],
      },
      httpClient
    );

    const results = await testProvider.searchByTitle({ query: 'Serial' });
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 1);
    assert.match(results[0].name, /Тестовый Сериал \/ Test Serial S1E2/);
    assert.equal(results[0].description, 'Тестовый Сериал / Test Serial Сезон 1 Серия 2 WEB-DL');
    assert.equal(results[0].posterUrl, 'https://example.org/poster.jpg');
    assert.equal(results[0].seeders, 1);
    assert.equal(results[0].leechers, 1);
    assert.equal(parseToIsoString(results[0].date), '2024-08-15T11:30:00.000Z');
  });

  it('should fetch NewStudio details from the topic path used by its search results', async () => {
    const definition = providers.find(provider => provider.id === 'newstudio')!.definition;
    const httpClient = new HttpClient();
    let requestedUrl = '';
    httpClient.getDecoded = async url => {
      requestedUrl = url;
      return '<h1>Sample Show S01E02</h1>';
    };
    const provider = new CardigannProvider(definition, httpClient);

    const details = await provider.getTopicDetails('700001');
    assert.ok(details);
    assert.equal(requestedUrl, 'https://newstudio.tv/viewtopic.php?t=700001');
    assert.equal(details.url, requestedUrl);
  });

  it('should preserve NewStudio absolute dates alongside Russian and English relative labels', async () => {
    const definition = providers.find(provider => provider.id === 'newstudio')!.definition;
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-22T22:30:00Z') });
    try {
      for (const [sampleDate, expectedDate] of [
        ['16-Ноя-17, Сегодня 12:34', '2017-11-16T09:34:00.000Z'],
        ['15-Ноя-17, Вчера 12:40', '2017-11-15T09:40:00.000Z'],
        ['16-Nov-17, Today 01:34', '2017-11-15T22:34:00.000Z'],
        ['15-Nov-17, Yesterday 17:20', '2017-11-15T14:20:00.000Z'],
        ['4-Nov-17, 23:50', '2017-11-04T20:50:00.000Z'],
        ['Сегодня, 12:34', '2026-09-23T09:34:00.000Z'],
        ['Вчера, 12:40', '2026-09-22T09:40:00.000Z'],
        ['Today 01:34', '2026-09-22T22:34:00.000Z'],
        ['Yesterday 17:20', '2026-09-22T14:20:00.000Z'],
      ]) {
        const httpClient = new HttpClient();
        httpClient.getDecoded = async () => testNewStudioSearchHtml.replace('15-Авг-24 14:30', sampleDate);
        const provider = new CardigannProvider({ ...definition, requestDelay: undefined }, httpClient);
        const results = await provider.searchByTitle({ query: 'Serial' });
        assert.equal(parseToIsoString(results[0].date), expectedDate);
      }
    } finally {
      mock.timers.reset();
    }
  });

  it('should search unclassified torrent.by releases with standard category filters', async () => {
    const definition = providers.find(provider => provider.id === 'torrentby')!.definition;
    const httpClient = new HttpClient();
    let requestCount = 0;
    httpClient.getDecoded = async () => { requestCount++; return testTorrentBySearchHtml; };
    const provider = new CardigannProvider({ ...definition, requestDelay: undefined }, httpClient);
    for (const category of [2000, 5000]) {
      assert.deepEqual(await provider.searchByTitle({ categories: [category], query: 'Example' }), []);
    }
    for (const categories of [[], [8000]]) {
      const results = await provider.searchByTitle({ categories, query: 'Example' });
      assert.equal(results.length, 1);
      assert.equal(results[0].category, 'other');
    }
    assert.equal(requestCount, 2);
  });

  it('should parse torrent.by search results and extract direct magnet link', async () => {
    const torrentByDef = providers.find(
      p => (p.definition.id || p.definition.site) === 'torrentby'
    )!;
    assert.ok(torrentByDef);
    assert.equal(torrentByDef.encoding, 'utf-8');

    const testProvider = new CardigannProvider(
      {
        ...torrentByDef.definition,
        links: [`${baseUrl}/torrentby/`],
      },
      httpClient
    );

    const results = await testProvider.searchByTitle({ query: 'Test' });
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 1);
    assert.match(results[0].name, /Тестовый Релиз \/ Test Release/);
    assert.equal(results[0].seeders, 95);
    assert.equal(results[0].leechers, 4);
    assert.ok(results[0].magnetUri);
    assert.match(results[0].magnetUri, /^magnet:\?xt=urn:btih:0123456789abcdef/);
  });
});
