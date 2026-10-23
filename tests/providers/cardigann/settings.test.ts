// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient } from '../../../src/http/http-client.js';
import { CardigannProvider } from '../../../src/providers/cardigann/provider.js';
import { getSettingVariableName, resolveSettings } from '../../../src/providers/cardigann/settings.js';
import { CardigannDefinition, CardigannSetting } from '../../../src/providers/cardigann/types.js';

const sampleSettings: CardigannSetting[] = [
  { name: 'username', type: 'text' },
  { name: 'password', type: 'password' },
  { default: false, name: 'stripcyrillic', type: 'checkbox' },
  { default: 0, name: 'sort', options: { 0: 'created desc', 2: 'seeders desc' }, type: 'select' },
  { default: 'sample', name: 'uploader-name', type: 'text' },
  { name: 'info_tpp', type: 'info' },
];

describe('resolveSettings', () => {
  it('should derive setting variable names from the tracker prefix', () => {
    assert.equal(getSettingVariableName('TORRGATE_SAMPLE', 'uploader-name'), 'TORRGATE_SAMPLE_UPLOADER_NAME');
  });

  it('should use declared defaults and skip credentials and informational settings', () => {
    assert.deepEqual(resolveSettings(sampleSettings, 'TORRGATE_SAMPLE', {}), {
      'sort': 0,
      'stripcyrillic': false,
      'uploader-name': 'sample',
    });
  });

  it('should read typed values from environment variables', () => {
    const env = {
      TORRGATE_SAMPLE_PASSWORD: 'sample-pass',
      TORRGATE_SAMPLE_SORT: '2',
      TORRGATE_SAMPLE_STRIPCYRILLIC: 'Yes',
      TORRGATE_SAMPLE_UPLOADER_NAME: 'Test Uploader',
    };
    assert.deepEqual(resolveSettings(sampleSettings, 'TORRGATE_SAMPLE', env), {
      'sort': '2',
      'stripcyrillic': true,
      'uploader-name': 'Test Uploader',
    });
  });

  it('should warn about invalid values and keep the default', () => {
    const warnings: string[] = [];
    const config = resolveSettings(
      sampleSettings,
      'TORRGATE_SAMPLE',
      { TORRGATE_SAMPLE_SORT: '5', TORRGATE_SAMPLE_STRIPCYRILLIC: 'maybe' },
      message => warnings.push(message)
    );
    assert.equal(config.sort, 0);
    assert.equal(config.stripcyrillic, false);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /TORRGATE_SAMPLE_STRIPCYRILLIC/);
    assert.match(warnings[1], /TORRGATE_SAMPLE_SORT/);
  });
});

describe('Definition settings and IMDb ids in search requests', () => {
  let baseUrl: string;
  let requestedPaths: string[];
  let testServer: http.Server;

  before(async () => {
    testServer = http.createServer((req, res) => {
      requestedPaths.push(req.url || '');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<table><tr class="row"><td><a href="/torrent/1">Example Release</a></td></tr></table>');
    });
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(testServer.address() as { port: number }).port}/`;
  });

  after(async () => {
    delete process.env.TORRGATE_SETTINGSTRACKER_SORT;
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  const createDefinition = (): CardigannDefinition => ({
    caps: { modes: { 'movie-search': ['q', 'imdbid'], 'search': ['q'] } },
    id: 'settingstracker',
    links: [baseUrl],
    name: 'Settings Tracker',
    search: {
      fields: { details: { attribute: 'href', selector: 'a' }, title: { selector: 'a' } },
      paths: [{ path: 'search/{{ .Config.sort }}/{{ if .Query.IMDBID }}{{ .Query.IMDBID }}-{{ .Query.IMDBIDShort }}{{ else }}{{ .Keywords }}{{ end }}' }],
      rows: { selector: 'tr.row' },
    },
    settings: [{ default: 0, name: 'sort', options: { 0: 'created desc', 2: 'seeders desc' }, type: 'select' }],
  });

  it('should render configured settings and IMDb ids into request templates', async () => {
    requestedPaths = [];
    process.env.TORRGATE_SETTINGSTRACKER_SORT = '2';
    const provider = new CardigannProvider(createDefinition(), new HttpClient());

    await provider.searchByTitle({ query: 'Example' });
    await provider.searchByTitle({ imdbId: 'tt0123456', query: '' });

    assert.deepEqual(requestedPaths, ['/search/2/Example', '/search/2/tt0123456-0123456']);
  });

  it('should read caps modes in Jackett parameter order, matching names case-insensitively', () => {
    const definition = createDefinition();
    definition.caps = {
      allowrawsearch: true,
      allowtvsearchimdb: true,
      modes: { 'movie-search': ['Year', 'q', 'IMDBID', 'unknown'], 'search': ['q'], 'tv-search': ['ep', 'q', 'season'] },
    };
    const provider = new CardigannProvider(definition, new HttpClient());
    assert.deepEqual(provider.searchCaps, {
      modes: {
        'movie-search': ['q', 'imdbid', 'year'],
        'search': ['q'],
        'tv-search': ['q', 'season', 'ep'],
      },
      supportsRawSearch: true,
      supportsTvImdbSearch: true,
    });
  });

  it('should still search definitions without imdbid support for IMDb queries, as Jackett does', async () => {
    requestedPaths = [];
    const definition = createDefinition();
    definition.caps = { modes: { search: ['q'] } };
    const provider = new CardigannProvider(definition, new HttpClient());

    assert.equal((await provider.searchByTitle({ imdbId: 'tt0123456', query: 'Example' })).length, 1);
    assert.equal(requestedPaths.length, 1);
  });
});
