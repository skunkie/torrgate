// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getCategoriesForProvider } from '../../src/config/categories.js';
import { CardigannDefinition } from '../../src/providers/types.js';

describe('Category Configuration', () => {
  const sampleDefinition: CardigannDefinition = {
    caps: {
      categorymappings: [
        { cat: 'Movies', desc: 'Фильмы', id: 1001 },
        { cat: 'TV', desc: 'Сериалы', id: 1002 },
        { cat: 'Audio', desc: 'Музыка', id: 1003 },
      ],
    },
    links: ['https://example.org'],
    name: 'Sample Tracker',
    search: {
      fields: {},
      paths: [],
      rows: { selector: 'tr' },
    },
  };

  it('should return categories list from Cardigann definition', () => {
    const categories = getCategoriesForProvider(sampleDefinition);
    assert.ok(Array.isArray(categories));
    assert.equal(categories.length, 3);
    assert.equal(categories[0]?.id, 1001);
    assert.equal(categories[0]?.name, 'Фильмы');
  });

  it('should return empty array when definition has no category mappings', () => {
    const emptyDef: CardigannDefinition = {
      ...sampleDefinition,
      caps: undefined,
    };
    const categories = getCategoriesForProvider(emptyDef);
    assert.deepEqual(categories, []);
  });
});
