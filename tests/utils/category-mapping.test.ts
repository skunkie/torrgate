// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CardigannCategoryMapping } from '../../src/providers/types.js';
import {
  expandTorznabCategories,
  matchesRequestedCategories,
  parseCategoryList,
  torznabCatToTrackerIds,
  torznabIdForName,
  trackerCatToTorznab,
} from '../../src/utils/category-mapping.js';

describe('Category Mapping Utility', () => {
  const sampleMappings: CardigannCategoryMapping[] = [
    { cat: 'Movies', desc: 'Sample Movies Category', id: 1 },
    { cat: 'TV', desc: 'Sample TV Shows', id: 4 },
    { cat: 'TV/Anime', desc: 'Sample Animation', id: 5 },
    { cat: 'TV/HD', desc: 'Sample HD Series', id: 6 },
    { cat: 'Audio/Lossless', desc: 'Sample Lossless Music', id: 2 },
  ];

  describe('torznabIdForName', () => {
    it('should resolve standard parent and subcategory names case-insensitively', () => {
      assert.equal(torznabIdForName('Movies'), 2000);
      assert.equal(torznabIdForName('tv/anime'), 5070);
      assert.equal(torznabIdForName('Audio/Lossless'), 3040);
    });

    it('should fall back to the parent for an unknown subcategory and reject unknown names', () => {
      assert.equal(torznabIdForName('TV/Unknown'), 5000);
      assert.equal(torznabIdForName('Sample Category'), undefined);
    });
  });

  describe('expandTorznabCategories', () => {
    it('should expand a parent to its subcategories but keep a subcategory as is', () => {
      const expanded = expandTorznabCategories([5000, 3040]);
      assert.ok(expanded.has(5000));
      assert.ok(expanded.has(5070));
      assert.ok(expanded.has(3040));
      assert.ok(!expanded.has(3010));
    });
  });

  describe('torznabCatToTrackerIds (Reverse Translation)', () => {
    it('should map a parent category to every tracker category beneath it', () => {
      assert.deepEqual(torznabCatToTrackerIds([5000], sampleMappings), [4, 5, 6]);
    });

    it('should map a subcategory only to tracker categories with that subcategory', () => {
      assert.deepEqual(torznabCatToTrackerIds([5040], sampleMappings), [6]);
      assert.deepEqual(torznabCatToTrackerIds([5030, 5040], sampleMappings), [6]);
    });

    it('should map tracker-specific 100000 + id categories to the tracker id', () => {
      assert.deepEqual(torznabCatToTrackerIds([100005], sampleMappings), [5]);
    });

    it('should accept category names and direct tracker ids', () => {
      assert.deepEqual(torznabCatToTrackerIds(['movies'], sampleMappings), [1]);
      assert.deepEqual(torznabCatToTrackerIds([4], sampleMappings), [4]);
    });

    it('should return no tracker ids for categories the tracker does not carry', () => {
      assert.deepEqual(torznabCatToTrackerIds([7000], sampleMappings), []);
      assert.deepEqual(torznabCatToTrackerIds(['unknown-category'], sampleMappings), []);
    });
  });

  describe('trackerCatToTorznab (Forward Translation)', () => {
    it('should report the standard subcategory and the tracker-specific id', () => {
      assert.deepEqual(trackerCatToTorznab(2, sampleMappings), {
        catDesc: 'Sample Lossless Music',
        catIds: [3040, 100002],
      });
      assert.deepEqual(trackerCatToTorznab('5', sampleMappings).catIds, [5070, 100005]);
    });

    it('should resolve a tracker category by its description', () => {
      assert.deepEqual(trackerCatToTorznab('Sample Movies Category', sampleMappings).catIds, [2000, 100001]);
    });

    it('should report unmapped categories as Other', () => {
      assert.deepEqual(trackerCatToTorznab(9999, sampleMappings).catIds, [8000]);
      assert.deepEqual(trackerCatToTorznab(undefined, sampleMappings), { catDesc: 'Other', catIds: [8000] });
    });
  });

  describe('matchesRequestedCategories', () => {
    it('should keep results in a requested category or beneath a requested parent', () => {
      const requested = expandTorznabCategories([5000]);
      assert.equal(matchesRequestedCategories(5, requested, sampleMappings), true);
      assert.equal(matchesRequestedCategories(1, requested, sampleMappings), false);
    });

    it('should keep results whose category cannot be classified', () => {
      assert.equal(matchesRequestedCategories('Sample Unmapped', new Set([5000]), sampleMappings), true);
    });
  });

  describe('parseCategoryList', () => {
    it('should parse comma-separated and repeated category parameters', () => {
      assert.deepEqual(parseCategoryList({ cat: '5000,5040,5030' }), [5000, 5040, 5030]);
      assert.deepEqual(parseCategoryList({ 'Category[]': ['5000', '2000,2040'] }), [5000, 2000, 2040]);
    });

    it('should ignore non-numeric values and duplicates', () => {
      assert.deepEqual(parseCategoryList({ cat: '5000,abc,5000' }), [5000]);
      assert.deepEqual(parseCategoryList({}), []);
    });
  });
});
