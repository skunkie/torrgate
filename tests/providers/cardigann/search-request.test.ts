// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSearchInputs, buildSearchUrl } from '../../../src/providers/cardigann/search-request.js';
import { CardigannSearch } from '../../../src/providers/cardigann/types.js';

describe('Cardigann search requests', () => {
  it('should combine declared and raw inputs while replacing matching URL parameters', () => {
    const search: CardigannSearch = {
      fields: {},
      inputs: { $raw: 'tag=first&tag=second', empty: '', q: 'base' },
      paths: [],
      rows: { selector: 'article' },
    };
    const inputs = buildSearchInputs(search, { inputs: { q: '{{ .Keywords }}' }, path: 'search' }, { Keywords: 'Sample & Release' });
    assert.deepEqual([...inputs], [['tag', 'first'], ['tag', 'second'], ['q', 'Sample & Release']]);
    const url = new URL(buildSearchUrl('search?q=old&keep=1', {}, 'https://tracker.example.test/', 'utf-8', inputs, false));
    assert.deepEqual([...url.searchParams], [['keep', '1'], ['tag', 'first'], ['tag', 'second'], ['q', 'Sample & Release']]);
  });

  it('should encode path values and query inputs in the tracker charset', () => {
    const context = { Keywords: 'Тест &/+' };
    const inputs = new URLSearchParams([['q', 'Тест &/+']]);
    const url = buildSearchUrl('search/{{ .Keywords }}?q=old&keep=1', context, 'https://tracker.example.test/', 'windows-1251', inputs, false);
    assert.equal(url, 'https://tracker.example.test/search/%D2%E5%F1%F2%20%26%2F%2B?keep=1&q=%D2%E5%F1%F2+%26%2F%2B');
    assert.equal(buildSearchUrl('search?keep=1', context, 'https://tracker.example.test/', 'windows-1251', inputs, true), 'https://tracker.example.test/search?keep=1');
  });
});
