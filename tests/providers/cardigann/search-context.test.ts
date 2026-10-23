// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSearchContext } from '../../../src/providers/cardigann/search-context.js';
import { CardigannDefinition } from '../../../src/providers/cardigann/types.js';

describe('Cardigann search context', () => {
  it('should expose the prior browsing year during January and preserve settings', () => {
    const definition: CardigannDefinition = {
      caps: { categorymappings: [{ cat: 'TV/HD', id: 'sample-section' }] },
      links: ['https://tracker.example.test/'],
      name: 'Sample Tracker',
      search: { fields: {}, paths: [], rows: { selector: 'article' } },
    };
    const settings = { token: 'test-token' };
    const options = { categories: [5040], episode: '02', query: 'Sample Show', searchType: 'tvsearch' as const, season: 1, year: 2024 };
    const context = createSearchContext(definition, settings, options, new Date(2026, 0, 15));
    assert.deepEqual(context.Categories, ['sample-section']);
    assert.equal(context.Query?.Keywords, 'Sample Show 2024 S01E02');
    assert.equal(context.Query?.IsTVSearch, 'True');
    assert.equal(context.Today?.Year, 2025);
    assert.equal(createSearchContext(definition, settings, options, new Date(2026, 1, 1)).Today?.Year, 2026);
    assert.notEqual(context.Config, settings);
    assert.deepEqual(settings, { token: 'test-token' });
  });
});
