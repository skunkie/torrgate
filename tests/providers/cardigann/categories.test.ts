// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canHandleCategories, getSupportedCategoryIds } from '../../../src/jackett/categories/mapping.js';
import { getDefinitionCategoryMappings } from '../../../src/providers/cardigann/categories.js';

describe('Cardigann category declarations', () => {
  it('should combine both declaration forms without fabricating descriptions', () => {
    const mappings = getDefinitionCategoryMappings({
      categories: { 1: 'Movies' },
      categorymappings: [{ cat: 'TV/HD', desc: 'Sample TV', id: 2 }],
    });
    assert.deepEqual(mappings, [{ cat: 'Movies', id: '1' }, { cat: 'TV/HD', desc: 'Sample TV', id: 2 }]);
    assert.deepEqual([...getSupportedCategoryIds(mappings)], [2000, 5000, 5040, 100002]);
    assert.equal(canHandleCategories([100001], mappings), false);
  });

});
