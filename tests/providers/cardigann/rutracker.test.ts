// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, it, mock } from 'node:test';

import { load } from 'cheerio';
import iconv from 'iconv-lite';

import { encodeWin1251QueryParam, HttpClient } from '../../../src/http/http-client.js';
import { createApp } from '../../../src/index.js';
import { JackettSearchResponse } from '../../../src/jackett/types.js';
import { loadDefinitionsFromDir } from '../../../src/providers/cardigann/loader.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { INITIAL_LOGIN_RETRY_DELAY_MS } from '../../../src/providers/cardigann/session-manager.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';
import { ProviderRegistry } from '../../../src/providers/registry.js';
import {
  testRuTrackerOrgSearchHtml,
  testRuTrackerOrgTopicHtml,
  testRuTrackerOrgTorrent,
} from '../../fixtures/rutracker-org.fixture.js';

describe('Local RuTracker.org Cardigann definition', () => {
  let baseUrl: string;
  let definition: CardigannDefinition;
  let hasCaptcha: boolean;
  let isLoginDenied: boolean;
  let isSessionActive: boolean;
  let loginCount: number;
  let loginForms: string[];
  let provider: CardigannProvider;
  let queries: Array<{ categories: string[]; cookie: string; url: string }>;
  let testServer: http.Server;
  const originalEnvironment = { ...process.env };
  const loginPage = '<html><body><form><input name="login_username"></form></body></html>';

  before(async () => {
    testServer = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const hasSession = isSessionActive && req.headers.cookie?.includes('bb_session=sample-session');
      res.setHeader('Content-Type', 'text/html; charset=windows-1251');
      const sendHtml = (html: string): void => { res.end(iconv.encode(html, 'win1251')); };
      if (url.pathname === '/forum/login.php' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += String(chunk); });
        req.on('end', () => {
          loginCount++;
          loginForms.push(body);
          if (hasCaptcha) {
            sendHtml('<html><body><input name="cap_code_sample"><img src="https://static.example.test/captcha/sample.png"></body></html>');
          } else if (isLoginDenied) {
            sendHtml('<html><body><h4 class="warnColor1 tCenter mrg_16">Invalid sample credentials</h4></body></html>');
          } else {
            isSessionActive = true;
            res.writeHead(302, { 'Location': '/forum/index.php', 'Set-Cookie': 'bb_session=sample-session; Path=/' });
            res.end();
          }
        });
      } else if (!hasSession) {
        sendHtml(loginPage);
      } else if (url.pathname === '/forum/tracker.php') {
        const categories = (url.searchParams.get('f') ?? '').split(',').filter(Boolean);
        queries.push({ categories, cookie: req.headers.cookie ?? '', url: req.url ?? '' });
        const $ = load(testRuTrackerOrgSearchHtml);
        if (categories.length) {
          $('#tor-tbl tbody > tr').each((_, element) => {
            const href = $(element).find('.f-name a').attr('href') ?? '';
            if (!categories.includes(new URL(href, baseUrl).searchParams.get('f') ?? '')) $(element).remove();
          });
        }
        sendHtml($.html());
      } else if (url.pathname === '/forum/viewtopic.php') {
        sendHtml(testRuTrackerOrgTopicHtml);
      } else if (url.pathname === '/forum/dl.php') {
        res.setHeader('Content-Disposition', 'attachment; filename="example-release.torrent"');
        res.setHeader('Content-Type', 'application/x-bittorrent');
        res.end(testRuTrackerOrgTorrent);
      } else {
        sendHtml('<html><body><a id="logged-in-username">Sample User</a></body></html>');
      }
    });
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(testServer.address() as { port: number }).port}/`;
    definition = loadDefinitionsFromDir('definitions', new HttpClient()).find(provider => provider.id === 'rutracker')!.definition;
  });

  beforeEach(() => {
    process.env.TORRGATE_RUTRACKER_USERNAME = 'тестовый_пользователь';
    process.env.TORRGATE_RUTRACKER_PASSWORD = 'sample-password';
    delete process.env.TORRGATE_RUTRACKER_COOKIE;
    delete process.env.TORRGATE_TRACKER_USERNAME;
    delete process.env.TORRGATE_TRACKER_PASSWORD;
    hasCaptcha = false;
    isLoginDenied = false;
    isSessionActive = false;
    loginCount = 0;
    loginForms = [];
    queries = [];
    provider = new CardigannProvider({ ...definition, links: [baseUrl] }, new HttpClient());
  });

  after(async () => {
    process.env = originalEnvironment;
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  it('should distinguish .org metadata and categories from the public .ru indexer', () => {
    assert.equal(definition.id, 'rutracker');
    assert.equal(definition.name, 'RuTracker.org');
    assert.equal(definition.type, 'semi-private');
    assert.equal(definition.encoding, 'windows-1251');
    assert.deepEqual(definition.links, ['https://rutracker.org/', 'https://rutracker.net/']);
    assert.equal(definition.caps?.categorymappings?.find(mapping => mapping.id === 22)?.cat, 'Movies');
    assert.equal(definition.caps?.categorymappings?.find(mapping => mapping.id === 9)?.cat, 'TV');
  });

  it('should authenticate, transcode wildcard searches, and extract the C# provider fields', async () => {
    const items = await provider.searchByTitle({ query: 'Пример Релиза' });
    assert.equal(loginCount, 1);
    assert.ok(loginForms[0].includes(`login_username=${encodeWin1251QueryParam('тестовый_пользователь')}`));
    assert.equal(queries.length, 1);
    assert.ok(queries[0].url.includes(`nm=${encodeWin1251QueryParam('Пример%Релиза')}`));
    assert.equal(queries[0].cookie, 'bb_session=sample-session');
    assert.deepEqual(items.map(item => item.id), ['110001', '110002', '110004']);
    const [movie, series, inactive] = items;
    assert.equal(movie.category, '22');
    assert.match(movie.name, /Example Movie/);
    assert.equal(movie.sizeBytes, 2684354560);
    assert.equal(movie.date, '2024-08-15T12:00:00.000Z');
    assert.equal(movie.seeders, 1234);
    assert.equal(movie.leechers, 15);
    assert.equal(movie.downloadCount, 2345);
    assert.equal(movie.torrentUrl, `${baseUrl}forum/dl.php?t=110001`);
    assert.equal(movie.url, `${baseUrl}forum/viewtopic.php?t=110001`);
    assert.equal(movie.downloadVolumeFactor, 1);
    assert.equal(movie.minimumRatio, 1);
    assert.equal(movie.minimumSeedTimeSeconds, 0);
    assert.match(series.name, /Sample Series S1E2.*WEB-DL/);
    assert.equal(inactive.seeders, undefined);
  });

  it('should split broad category searches into bounded paths without losing categories', async () => {
    const items = await provider.searchByTitle({ categories: [5000], query: 'Sample Series' });
    assert.ok(queries.length > 1);
    assert.ok(queries.every(query => query.categories.length > 0 && query.categories.length <= 200));
    const expected = definition.caps!.categorymappings!
      .filter(mapping => mapping.cat === 'TV' || mapping.cat.startsWith('TV/'))
      .map(mapping => String(mapping.id)).sort();
    const sent = queries.flatMap(query => query.categories).sort();
    assert.deepEqual(sent, expected);
    assert.deepEqual(items.map(item => item.id), ['110002', '110004']);
  });

  it('should send the explicit empty query used to browse recent releases', async () => {
    assert.equal((await provider.searchByTitle({ query: '' })).length, 3);
    assert.equal(queries.length, 1);
    assert.equal(queries[0].url, '/forum/tracker.php?nm=');
  });

  it('should preserve exact tracker-category and TV episode requests', async () => {
    const items = await provider.searchByTitle({ categories: [100009], query: 'Sample Series S01E02' });
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].categories, ['9']);
    assert.ok(queries[0].url.includes(`nm=${encodeWin1251QueryParam('Sample%Series%ТВ | Сезон: 1 Серии: 2')}`));
    assert.deepEqual(items.map(item => item.id), ['110002', '110004']);
  });

  it('should verify and use an environment session cookie without logging in', async () => {
    process.env.TORRGATE_RUTRACKER_COOKIE = 'bb_session=sample-session';
    isSessionActive = true;
    provider = new CardigannProvider({ ...definition, links: [baseUrl] }, new HttpClient());
    assert.equal((await provider.searchByTitle({ query: 'Example' })).length, 3);
    assert.equal(loginCount, 0);
    assert.equal(queries[0].cookie, 'bb_session=sample-session');
  });

  it('should renew an expired session and retry the search', async () => {
    await provider.searchByTitle({ query: 'Example' });
    isSessionActive = false;
    assert.equal((await provider.searchByTitle({ query: 'Example' })).length, 3);
    assert.equal(loginCount, 2);
  });

  it('should fetch topic details and download the authenticated torrent', async () => {
    const details = await provider.getTopicDetails('110001');
    assert.equal(details?.url, `${baseUrl}forum/viewtopic.php?t=110001`);
    assert.equal(details?.torrentUrl, `${baseUrl}forum/dl.php?t=110001`);
    const magnet = new URL(details!.magnetUri);
    assert.equal(magnet.searchParams.get('xt'), 'urn:btih:0123456789abcdef0123456789abcdef01234567');
    assert.deepEqual(magnet.searchParams.getAll('tr'), definition.trackers);
    const torrent = await provider.downloadTorrent(`${baseUrl}forum/dl.php?t=110001`);
    assert.deepEqual(torrent.data, testRuTrackerOrgTorrent);
    assert.equal(torrent.fileName, 'example-release.torrent');
    assert.equal(loginCount, 1);
  });

  it('should report CAPTCHA requirements with the session-cookie configuration', async () => {
    hasCaptcha = true;
    await assert.rejects(provider.searchByTitle({ query: 'Example' }), /CAPTCHA.*TORRGATE_RUTRACKER_COOKIE/);
    assert.equal(provider.sessionManager.hasSession(), false);
  });

  it('should expose login error text and clear it after a successful login', async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.now() });
    try {
      isLoginDenied = true;
      await assert.rejects(provider.searchByTitle({ query: 'Example' }), /Invalid sample credentials/);
      assert.equal(provider.sessionManager.loginError, 'Invalid sample credentials');
      isLoginDenied = false;
      mock.timers.tick(INITIAL_LOGIN_RETRY_DELAY_MS);
      assert.equal((await provider.searchByTitle({ query: 'Example' })).length, 3);
      assert.equal(provider.sessionManager.loginError, undefined);
    } finally {
      mock.timers.reset();
    }
  });

  it('should explain required credentials for the .org provider', async () => {
    delete process.env.TORRGATE_RUTRACKER_USERNAME;
    delete process.env.TORRGATE_RUTRACKER_PASSWORD;
    await assert.rejects(provider.searchByTitle({ query: 'Example' }), /TORRGATE_RUTRACKER_USERNAME.*TORRGATE_RUTRACKER_PASSWORD.*TORRGATE_RUTRACKER_COOKIE/);
  });

  it('should expose .org results, transfer factors, downloads, and feeds through canonical routes', async () => {
    const registry = new ProviderRegistry(new HttpClient());
    registry.registerProvider(provider);
    const testAppServer = http.createServer(createApp(registry));
    await new Promise<void>(resolve => testAppServer.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(testAppServer.address() as { port: number }).port}`;
    try {
      const response = await fetch(`${origin}/api/v2.0/indexers/rutracker/results?query=Example`);
      assert.equal(response.status, 200);
      const data = await response.json() as JackettSearchResponse;
      const movie = data.Results.find(item => item.Category.includes(100022))!;
      assert.equal(movie.TrackerId, 'rutracker');
      assert.equal(movie.TrackerType, 'semi-private');
      assert.deepEqual(movie.Category, [2000, 100022]);
      assert.equal(movie.DownloadVolumeFactor, 1);
      assert.equal(movie.MinimumRatio, 1);
      assert.equal(movie.MinimumSeedTime, 0);
      assert.equal(movie.Peers, 15);
      const download = await fetch(movie.Link!);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), testRuTrackerOrgTorrent);
      const feed = await fetch(`${origin}/api/v2.0/indexers/rutracker/results/torznab/api?limit=1`);
      assert.equal(feed.status, 200);
      const xml = await feed.text();
      assert.match(xml, /<torznab:attr name="downloadvolumefactor" value="1"/);
      assert.match(xml, /<torznab:attr name="minimumratio" value="1"/);
      assert.match(xml, /<torznab:attr name="minimumseedtime" value="0"/);
    } finally {
      await new Promise<void>(resolve => testAppServer.close(() => resolve()));
    }
  });
});
