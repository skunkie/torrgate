// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { load } from 'cheerio';

import { parseSearchResults } from '../../src/providers/search-results.js';
import { CardigannDefinition } from '../../src/providers/types.js';

describe('Cardigann search result extraction', () => {
  const definition: CardigannDefinition = {
    caps: {
      categorymappings: [{ cat: 'Movies', id: 1 }, { cat: 'TV', id: 2 }],
    },
    links: ['https://tracker.example.test/'],
    name: 'Sample Tracker',
    search: {
      fields: {
        category: { attribute: 'data-category' },
        details: { attribute: 'href', selector: 'a' },
        download: {
          filters: [{ args: ['topic/', 'download/'], name: 'replace' }],
          text: '{{ .Result.details }}',
        },
        seeders: { selector: '.seeders' },
        size: { selector: '.size' },
        title: { selector: 'a' },
      },
      paths: [{ path: 'search/{{ .Page }}' }],
      rows: { selector: '.result' },
    },
  };
  const testHtml = `
    <div class="result" data-category="1">
      <a href="topic/101">Пример Фильма 1080p</a>
      <span class="seeders">1,234</span><span class="size">2 GB</span>
    </div>
    <div class="result" data-category="2">
      <a href="topic/102">Sample Show 720p</a>
      <span class="seeders">0</span><span class="size">512 MB</span>
    </div>`;

  it('should resolve dependent fields and normalize results before filtering', () => {
    const page = parseSearchResults(load(testHtml), {
      context: {},
      definition,
      options: { categories: [2000], format: 1080, query: 'Sample' },
      supportsPaging: true,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/search/',
    });

    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].name, 'Пример Фильма 1080p');
    assert.equal(page.items[0].seeders, 1234);
    assert.equal(page.items[0].sizeBytes, 2 * 1024 ** 3);
    assert.equal(page.items[0].url, 'https://tracker.example.test/search/topic/101');
    assert.equal(page.items[0].torrentUrl, 'https://tracker.example.test/search/download/101');
    assert.equal(page.hasMore, true);
    assert.ok(page.pageIdentity);
  });

  it('should retain pagination metadata when local filtering removes every result', () => {
    const parsePage = (format: number) => parseSearchResults(load(testHtml), {
      context: {},
      definition,
      options: { format, query: 'Sample' },
      supportsPaging: true,
      timeZone: 'Europe/Moscow',
      workingUrl: 'https://tracker.example.test/search/',
    });
    const visiblePage = parsePage(1080);
    const filteredPage = parsePage(2160);

    assert.deepEqual(filteredPage.items, []);
    assert.equal(filteredPage.hasMore, true);
    assert.equal(filteredPage.pageIdentity, visiblePage.pageIdentity);
  });
});
