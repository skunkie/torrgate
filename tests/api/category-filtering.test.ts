// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { HttpClient } from '../../src/http/http-client.js';
import { createApp } from '../../src/index.js';
import { JackettSearchResponse } from '../../src/jackett/types.js';
import { CardigannProvider } from '../../src/providers/cardigann/provider.js';
import { ProviderRegistry } from '../../src/providers/registry.js';

describe('Category filtering across canonical search and feed routes', () => {
  let origin: string;
  let registry: ProviderRegistry;
  let testServer: http.Server;

  before(async () => {
    const httpClient = new HttpClient();
    httpClient.getDecoded = async url => new URL(url).hostname === 'unclassified.example.test'
      ? '<article><a href="details.php?id=201">Sample Unclassified Release</a></article>'
      : `<article data-category="1"><a href="details.php?id=101">Sample Movie</a></article>
         <article data-category="2"><a href="details.php?id=102">Sample Show</a></article>
         <article data-category="3"><a href="details.php?id=103">Sample Other Release</a></article>
         <article data-category="999"><a href="details.php?id=104">Sample Unmapped Release</a></article>`;
    registry = new ProviderRegistry(httpClient, 'tests/fixtures');
    registry.registerProvider(new CardigannProvider({
      caps: {
        categorymappings: [{ cat: 'Movies', desc: 'Sample Movies', id: 1 }, { cat: 'TV/HD', desc: 'Sample TV', id: 2 }, { cat: 'Other', id: 3 }],
      },
      id: 'classified',
      links: ['https://classified.example.test/'],
      name: 'Sample Classified Tracker',
      search: {
        fields: {
          category: { attribute: 'data-category' },
          details: { attribute: 'href', selector: 'a' },
          size: { text: '1 GB' },
          title: { selector: 'a' },
        },
        paths: [{ path: 'search' }],
        rows: { selector: 'article' },
      },
      settings: [{ name: 'info_category_8000', type: 'info_category_8000' }],
    }, httpClient));
    registry.registerProvider(new CardigannProvider({
      id: 'unclassified',
      links: ['https://unclassified.example.test/'],
      name: 'Sample Unclassified Tracker',
      search: {
        fields: { details: { attribute: 'href', selector: 'a' }, size: { text: '1 GB' }, title: { selector: 'a' } },
        paths: [{ path: 'search' }],
        rows: { selector: 'article' },
      },
    }, httpClient));
    testServer = http.createServer(createApp(registry));
    await new Promise<void>(resolve => testServer.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(testServer.address() as { port: number }).port}`;
  });

  after(async () => {
    await new Promise<void>(resolve => testServer.close(() => resolve()));
  });

  // As in Jackett, releases without a mapped category pass the category filter, JSON searches keep
  // them, and Torznab feeds drop them; an indexer with none of the requested categories is skipped.
  const cases = [
    {
      category: '',
      feedTitles: ['Sample Movie', 'Sample Show', 'Sample Other Release'],
      titles: ['Sample Movie', 'Sample Show', 'Sample Other Release', 'Sample Unmapped Release', 'Sample Unclassified Release'],
    },
    { category: '2000', feedTitles: ['Sample Movie'], titles: ['Sample Movie', 'Sample Unmapped Release'] },
    { category: '5000', feedTitles: ['Sample Show'], titles: ['Sample Show', 'Sample Unmapped Release'] },
    { category: '5040', feedTitles: ['Sample Show'], titles: ['Sample Show', 'Sample Unmapped Release'] },
    { category: '100001', feedTitles: [], titles: ['Sample Movie', 'Sample Unmapped Release'] },
    { category: '8000', feedTitles: ['Sample Other Release'], titles: ['Sample Other Release', 'Sample Unmapped Release'] },
  ];

  for (const { category, feedTitles, titles } of cases) {
    it(`should return matching JSON and Torznab results for ${category || 'All'}`, async () => {
      for (const window of ['', '&limit=10']) {
        const response = await fetch(`${origin}/api/v2.0/indexers/all/results?category=${category}${window}`);
        assert.equal(response.status, 200);
        const data = await response.json() as JackettSearchResponse;
        assert.deepEqual(data.Results.map(item => item.Title), titles);
      }
      const feed = await fetch(`${origin}/api/v2.0/indexers/all/results/torznab/api?cat=${category}`);
      assert.equal(feed.status, 200);
      const xml = await feed.text();
      assert.deepEqual([...xml.matchAll(/<item>\s*<title>([^<]*)<\/title>/g)].map(match => match[1]), feedTitles);
    });
  }

  it('should emit and filter the categories accumulated or replaced by field modifiers', async () => {
    const httpClient = new HttpClient();
    httpClient.getDecoded = async () => '<article><a href="details.php?id=7">Sample<span> Promotion</span></a></article>';
    for (const shouldReplace of [false, true]) {
      const provider = new CardigannProvider({
        caps: { categorymappings: [{ cat: 'Movies', desc: 'Sample Movies', id: 1 }, { cat: 'TV/HD', desc: 'Sample TV', id: 2 }] },
        id: 'modifier-sample',
        links: ['https://modifier.example/'],
        name: 'Sample Modifier Tracker',
        search: {
          fields: Object.fromEntries([
            ['category', { text: '1' }],
            [shouldReplace ? 'category|noappend' : 'category|optional', { text: '2' }],
            ['details', { attribute: 'href', selector: 'a' }],
            ['size|optional', { default: '1 GB', selector: '.missing' }],
            ['title', { remove: 'span', selector: 'a' }],
            ['title|append', { text: ' Release' }],
          ]),
          paths: [{ path: 'search' }],
          rows: { selector: 'article' },
        },
      }, httpClient);
      registry.registerProvider(provider);
      const categories = shouldReplace ? [5040, 100002] : [2000, 100001, 5040, 100002];
      const response = await fetch(`${origin}/api/v2.0/indexers/modifier-sample/results`);
      const data = await response.json() as JackettSearchResponse;
      assert.deepEqual(data.Results[0].Category, categories);
      assert.equal(data.Results[0].CategoryDesc, shouldReplace ? 'TV/HD' : 'Movies, TV/HD');
      assert.equal(data.Results[0].Title, 'Sample Release');
      const feed = await (await fetch(`${origin}/api/v2.0/indexers/modifier-sample/results/torznab/api`)).text();
      assert.deepEqual([...feed.matchAll(/<torznab:attr name="category" value="(\d+)"/g)].map(match => Number(match[1])), categories);
      const filtered = await (await fetch(`${origin}/api/v2.0/indexers/modifier-sample/results?Category[]=2000`)).json() as JackettSearchResponse;
      assert.equal(filtered.Results.length, shouldReplace ? 0 : 1);
    }
  });
});
