// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getInspectionCategories } from '../../src/api/category-mappings.js';

describe('Category inspection', () => {
  it('should expose tracker IDs and descriptions for inspection', () => {
    assert.deepEqual(getInspectionCategories([
      { cat: 'Movies', desc: 'Тестовые фильмы', id: 42 },
      { cat: 'TV', desc: 'Тестовые серии', id: 43 },
    ]), [{ id: 42, name: 'Тестовые фильмы' }, { id: 43, name: 'Тестовые серии' }]);
  });

  it('should expose an empty list for an indexer without mappings', () => {
    assert.deepEqual(getInspectionCategories([]), []);
  });

  it('should expose named sections using standard IDs and the mapping name', () => {
    assert.deepEqual(getInspectionCategories([{ cat: 'Other', id: 'Other' }]), [{ id: 8000, name: 'Other' }]);
  });
});
