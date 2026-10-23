// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MemoryCache } from '../../src/cache/memory-cache.js';
import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { JackettIndexer } from '../../src/jackett/types.js';
import { CardigannProvider } from '../../src/providers/cardigann/provider.js';
import { CardigannDefinition } from '../../src/providers/cardigann/types.js';
import { ProviderRegistry } from '../../src/providers/registry.js';

const sampleDefinition: CardigannDefinition = {
  caps: { categories: { 1: 'Movies' } },
  description: 'Sample & description',
  id: 'discovery-public',
  language: 'en-US',
  links: ['https://tracker.example/'],
  name: 'Sample Tracker',
  search: { fields: { title: { text: 'Sample Release' } }, paths: [{ path: 'search' }], rows: { selector: 'article' } },
};

describe('Torznab indexer discovery', () => {
  let origin: string;
  let testServer: http.Server;
  let requestCount = 0;
  const httpClient = new HttpClient();
  httpClient.getDecoded = async () => { requestCount += 1; return ''; };
  const registry = new ProviderRegistry(httpClient, fileURLToPath(new URL('../fixtures/', import.meta.url)));
  const publicProvider = new CardigannProvider(sampleDefinition, httpClient);
  const cookieProvider = new CardigannProvider({
    ...sampleDefinition,
    caps: { categories: { 2: 'TV/HD' } },
    id: 'discovery-cookie',
    login: { method: 'cookie' },
    name: 'Sample Cookie Tracker',
    type: 'private',
  }, httpClient);

  before(async () => {
    registry.registerProvider(publicProvider);
    registry.registerProvider(cookieProvider);
    testServer = http.createServer(createApp(registry, { cache: new MemoryCache<unknown>(60) }));
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(testServer.address() as { port: number }).port}/api/v2.0/indexers`;
  });

  after(async () => {
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  it('should list metadata, configuration state, and embedded caps without contacting trackers', async () => {
    const response = await fetch(`${origin}/all/results/torznab/api?t=indexers`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type') ?? '', /application\/xml; charset=utf-8/);
    const xml = await response.text();
    assert.match(xml, /<indexer id="discovery-public" configured="true">/);
    assert.match(xml, /<indexer id="discovery-cookie" configured="false">/);
    assert.match(xml, /<title>Sample Tracker<\/title>\s*<description>Sample &amp; description<\/description>\s*<link>https:\/\/tracker.example\/<\/link>\s*<language>en-US<\/language>\s*<type>public<\/type>\s*<caps>/);
    assert.equal([...xml.matchAll(/<caps>/g)].length, 2);
    assert.match(xml, /<category id="2000" name="Movies" \/>/);
    assert.equal(requestCount, 0);
  });

  it('should filter configured case-insensitively and leave unknown or padded values unfiltered', async () => {
    for (const [value, expectedIds] of [
      ['TRUE', ['discovery-public']],
      ['false', ['discovery-cookie']],
      ['unknown', ['discovery-public', 'discovery-cookie']],
      ['%20true%20', ['discovery-public', 'discovery-cookie']],
      ['', ['discovery-public', 'discovery-cookie']],
    ] as const) {
      const xml = await (await fetch(`${origin}/all/results/torznab/api?t=indexers&CONFIGURED=${value}`)).text();
      assert.deepEqual([...xml.matchAll(/<indexer id="([^"]+)"/g)].map(match => match[1]), [...expectedIds], value);
    }
    cookieProvider.sessionManager.setCookies(['session=sample']);
    try {
      const empty = await (await fetch(`${origin}/all/results/torznab/api?t=indexers&configured=false`)).text();
      assert.equal(empty, '<?xml version="1.0" encoding="UTF-8"?>\n<indexers />');
      const indexers = await (await fetch(origin)).json() as JackettIndexer[];
      assert.ok(indexers.every(indexer => indexer.configured));
    } finally {
      cookieProvider.sessionManager.invalidate();
    }
  });

  it('should admit configured indexers and keep cached aggregate membership current', async () => {
    const sampleItem = {
      category: '1',
      date: '2024-01-01',
      id: 'sample',
      name: 'Sample Release',
      seeders: 1,
      size: '1 GB',
      sizeBytes: 1024 ** 3,
      torrentUrl: 'https://tracker.example/download/sample',
      url: 'https://tracker.example/details/sample',
    };
    publicProvider.searchByTitle = async () => [sampleItem];
    cookieProvider.searchByTitle = async () => [{ ...sampleItem, category: '2' }];
    for (const path of ['results', 'results/torznab/api']) {
      const base = `${origin}/all/${path}`;
      const first = await fetch(base);
      assert.equal(first.headers.get('x-cache'), 'MISS');
      const firstBody = await first.text();
      assert.ok(!firstBody.includes('Sample Cookie Tracker'));
      const cached = await fetch(base);
      assert.equal(cached.headers.get('x-cache'), 'HIT');
      cookieProvider.sessionManager.setCookies(['session=sample']);
      try {
        const configured = await fetch(base);
        assert.equal(configured.headers.get('x-cache'), 'MISS');
        assert.ok((await configured.text()).includes('Sample Cookie Tracker'));
        const direct = await fetch(`${origin}/discovery-cookie/${path}`);
        assert.equal(direct.status, 200);
      } finally {
        cookieProvider.sessionManager.invalidate();
      }
      const unconfigured = await fetch(`${origin}/discovery-cookie/${path}`);
      assert.equal(unconfigured.status, 404);
      assert.match(await unconfigured.text(), /Indexer is not configured/);
      const restored = await fetch(base);
      assert.equal(restored.headers.get('x-cache'), 'HIT');
      assert.equal(await restored.text(), firstBody);
    }
    const capsUrl = `${origin}/all/results/torznab/api?t=caps`;
    assert.doesNotMatch(await (await fetch(capsUrl)).text(), /name="TV"/);
    cookieProvider.sessionManager.setCookies(['session=sample']);
    try {
      assert.match(await (await fetch(capsUrl)).text(), /name="TV"/);
    } finally {
      cookieProvider.sessionManager.invalidate();
    }
    const unconfiguredCaps = await fetch(`${origin}/discovery-cookie/results/torznab/api?t=caps`);
    assert.equal(unconfiguredCaps.status, 404);
    assert.match(await unconfiguredCaps.text(), /<error code="201" description="Indexer is not configured"/);
  });

  it('should require usable cookies or the credentials needed by a login definition', context => {
    const names = ['TORRGATE_DISCOVERY_LOGIN_USERNAME', 'TORRGATE_DISCOVERY_LOGIN_PASSWORD', 'TORRGATE_DISCOVERY_LOGIN_COOKIE', 'TORRGATE_TRACKER_USERNAME', 'TORRGATE_TRACKER_PASSWORD'];
    const previous = names.map(name => process.env[name]);
    for (const name of names) delete process.env[name];
    context.after(() => {
      names.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
    });
    const definition: CardigannDefinition = {
      ...sampleDefinition,
      id: 'discovery-login',
      login: { inputs: { password: '{{ .Config.password }}', username: '{{ .Config.username }}' }, method: 'post', path: 'login' },
    };
    assert.equal(new CardigannProvider(definition, httpClient).isConfigured, false);
    process.env.TORRGATE_DISCOVERY_LOGIN_USERNAME = 'sample-user';
    assert.equal(new CardigannProvider(definition, httpClient).isConfigured, false);
    process.env.TORRGATE_DISCOVERY_LOGIN_PASSWORD = 'sample-password';
    assert.equal(new CardigannProvider(definition, httpClient).isConfigured, true);
    delete process.env.TORRGATE_DISCOVERY_LOGIN_USERNAME;
    delete process.env.TORRGATE_DISCOVERY_LOGIN_PASSWORD;
    process.env.TORRGATE_DISCOVERY_LOGIN_COOKIE = 'invalid-bare-cookie';
    assert.equal(new CardigannProvider({ ...definition, login: { method: 'cookie' } }, httpClient).isConfigured, false);
    process.env.TORRGATE_DISCOVERY_LOGIN_COOKIE = 'session=sample';
    assert.equal(new CardigannProvider({ ...definition, login: { method: 'cookie' } }, httpClient).isConfigured, true);
    delete process.env.TORRGATE_DISCOVERY_LOGIN_COOKIE;
    process.env.TORRGATE_TRACKER_USERNAME = 'sample-global-user';
    process.env.TORRGATE_TRACKER_PASSWORD = 'sample-global-password';
    assert.equal(new CardigannProvider(definition, httpClient).isConfigured, true);
  });

  it('should use the referenced login settings rather than requiring an unrelated account password', context => {
    const names = ['TORRGATE_DISCOVERY_SETTINGS_TOKEN', 'TORRGATE_DISCOVERY_SETTINGS_USERNAME', 'TORRGATE_DISCOVERY_SETTINGS_PASSWORD', 'TORRGATE_TRACKER_USERNAME', 'TORRGATE_TRACKER_PASSWORD'];
    const previous = names.map(name => process.env[name]);
    for (const name of names) delete process.env[name];
    context.after(() => {
      names.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
    });
    const definition: CardigannDefinition = {
      ...sampleDefinition,
      id: 'discovery-settings',
      login: { inputs: { token: '{{ .Config.token }}' }, method: 'post', path: 'login' },
      settings: [{ name: 'token', type: 'text' }],
    };
    assert.equal(new CardigannProvider(definition, httpClient).isConfigured, false);
    process.env.TORRGATE_DISCOVERY_SETTINGS_USERNAME = 'sample-user';
    process.env.TORRGATE_DISCOVERY_SETTINGS_PASSWORD = 'sample-password';
    assert.equal(new CardigannProvider(definition, httpClient).isConfigured, false);
    delete process.env.TORRGATE_DISCOVERY_SETTINGS_PASSWORD;
    const usernameDefinition = { ...definition, login: { inputs: { username: '{{ .Config.username }}' }, path: 'login' } };
    assert.equal(new CardigannProvider(usernameDefinition, httpClient).isConfigured, true);
    const conditionalDefinition = { ...definition, login: { inputs: { account: '{{ if .Config.token }}{{ .Config.token }}{{ else }}{{ .Config.username }}{{ end }}' }, path: 'login' } };
    assert.equal(new CardigannProvider(conditionalDefinition, httpClient).isConfigured, true);
    process.env.TORRGATE_DISCOVERY_SETTINGS_TOKEN = 'sample-token';
    assert.equal(new CardigannProvider(definition, httpClient).isConfigured, true);
    const defaultsDefinition = {
      ...definition,
      login: { inputs: { enabled: '{{ .Config.enabled }}', level: '{{ .Config.level }}' }, path: 'login' },
      settings: [{ default: false, name: 'enabled', type: 'checkbox' }, { default: 0, name: 'level', type: 'text' }],
    };
    assert.equal(new CardigannProvider(defaultsDefinition, httpClient).isConfigured, true);
  });

  it('should answer a non-aggregate discovery request with error 203', async () => {
    const response = await fetch(`${origin}/discovery-public/results/torznab/api?t=indexers`);
    assert.equal(response.status, 400);
    assert.match(await response.text(), /<error code="203" description="Function Not Available: this isn&apos;t a meta indexer" \/>/);
  });
});
