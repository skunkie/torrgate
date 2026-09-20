// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import iconv from 'iconv-lite';

import { HttpClient } from '../../src/http/http-client.js';
import { CardigannProvider } from '../../src/providers/cardigann-provider.js';
import { loadDefinitionsFromDir } from '../../src/providers/loader.js';
import { testBigFANGroupSearchHtml } from '../fixtures/bigfangroup.fixture.js';
import { testKinozalSearchHtml } from '../fixtures/kinozal.fixture.js';
import { testMegaPeerSearchHtml } from '../fixtures/megapeer.fixture.js';
import { testNewStudioSearchHtml } from '../fixtures/newstudio.fixture.js';
import { testNoNameClubSearchHtml } from '../fixtures/nonameclub.fixture.js';
import { testRuTorSearchHtml } from '../fixtures/rutor.fixture.js';
import { testRuTrackerSearchHtml } from '../fixtures/rutracker.fixture.js';
import { testTorrentBySearchHtml } from '../fixtures/torrentby.fixture.js';

describe('Jackett Cardigann Definitions Compatibility', () => {
  let baseUrl: string;
  let httpClient: HttpClient;
  let providers: CardigannProvider[];
  let testServer: http.Server;

  before(async () => {
    testServer = http.createServer((req, res) => {
      const url = req.url || '';

      if (url.includes('/rutracker/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=windows-1251' });
        res.end(iconv.encode(testRuTrackerSearchHtml, 'win1251'));
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
        res.end(iconv.encode(testBigFANGroupSearchHtml, 'win1251'));
      } else if (url.includes('/newstudio/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(testNewStudioSearchHtml);
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
    assert.match(firstResult.name, /Пример Релиза \/ Example Release/);
    assert.equal(firstResult.seeders, 320);
    assert.equal(firstResult.leechers, 15);
    assert.ok((firstResult.sizeBytes ?? 0) > 0);
    assert.match(firstResult.magnetUri ?? '', /&tr=udp%3A%2F%2Fopentor\.net%3A6969/);
  });

  it('should parse RuTracker search results using Cardigann definition', async () => {
    const rutrackerDef = providers.find(
      p => (p.definition.id || p.definition.site) === 'rutracker-ru'
    )!;
    assert.ok(rutrackerDef);
    assert.equal(rutrackerDef.encoding, 'windows-1251');

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
    assert.match(results[0].name, /Вымышленный Фильм \/ Fictional Film/);
    assert.equal(results[0].seeders, 90);
    assert.equal(results[0].leechers, 8);
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
    assert.equal(results[0].seeders, 1);
    assert.equal(results[0].leechers, 1);
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
