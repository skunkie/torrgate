// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { torznabIdForName } from '../../../src/jackett/categories/catalog.js';
import { canHandleCategories, expandTorznabCategories, getCategoryBindings, getSupportedCategoryIds, matchesRequestedCategories, parseTorznabCategoryList, torznabCatToTrackerIds, trackerCatToTorznabIds } from '../../../src/jackett/categories/mapping.js';
import { TrackerCategoryMapping } from '../../../src/types/provider.js';

describe('Category Mapping Utility', () => {
  const sampleMappings: TrackerCategoryMapping[] = [
    { cat: 'Movies', desc: 'Sample Movies Category', id: 1 },
    { cat: 'TV', desc: 'Sample TV Shows', id: 4 },
    { cat: 'TV/Anime', desc: 'Sample Animation', id: 5 },
    { cat: 'TV/HD', desc: 'Sample HD Series', id: 6 },
    { cat: 'Audio/Lossless', desc: 'Sample Lossless Music', id: 2 },
  ];

  describe('torznabIdForName', () => {
    it('should resolve exact standard parent and subcategory names', () => {
      assert.equal(torznabIdForName('Movies'), 2000);
      assert.equal(torznabIdForName('TV/Anime'), 5070);
      assert.equal(torznabIdForName('Audio/Lossless'), 3040);
    });

    it('should reject unknown or noncanonical category names', () => {
      assert.equal(torznabIdForName('TV/Unknown'), undefined);
      assert.equal(torznabIdForName('tv/anime'), undefined);
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

    it('should require advertised Torznab IDs rather than raw tracker IDs', () => {
      assert.deepEqual(torznabCatToTrackerIds([4], sampleMappings), []);
    });

    it('should return no tracker ids for categories the tracker does not carry', () => {
      assert.deepEqual(torznabCatToTrackerIds([7000], sampleMappings), []);
      assert.deepEqual(torznabCatToTrackerIds([9999], sampleMappings), []);
    });
  });

  describe('trackerCatToTorznabIds (Forward Translation)', () => {
    it('should emit distinct standard and tracker-specific IDs in mapping order', () => {
      const mappings = [
        { cat: 'TV', desc: 'Sample Cartoons', id: 21 },
        { cat: 'Movies', desc: 'Sample Cartoons', id: '21' },
        { cat: 'TV', desc: 'Sample Cartoons', id: 21 },
        { cat: 'Audio', id: 22 },
      ];
      for (const category of [21, '21']) {
        assert.deepEqual(trackerCatToTorznabIds(category, mappings), [5000, 100021, 2000]);
      }
      assert.deepEqual(trackerCatToTorznabIds(22, mappings), [3000]);
    });

    it('should report the standard subcategory and the tracker-specific id', () => {
      assert.deepEqual(trackerCatToTorznabIds(2, sampleMappings), [3040, 100002]);
      assert.deepEqual(trackerCatToTorznabIds('5', sampleMappings), [5070, 100005]);
    });

    it('should require a tracker ID when mapping a category field', () => {
      assert.deepEqual(trackerCatToTorznabIds('Sample Movies Category', sampleMappings), []);
    });

    it('should give unmapped or missing categories no categories, as Jackett does', () => {
      assert.deepEqual(trackerCatToTorznabIds(9999, sampleMappings), []);
      assert.deepEqual(trackerCatToTorznabIds('Sample Unmapped', sampleMappings), []);
      assert.deepEqual(trackerCatToTorznabIds(undefined, sampleMappings), []);
    });
  });

  describe('matchesRequestedCategories', () => {
    it('should match standard and tracker-specific Torznab IDs', () => {
      for (const category of [100006, 5040]) {
        assert.equal(matchesRequestedCategories('6', expandTorznabCategories([category]), sampleMappings), true);
        assert.equal(matchesRequestedCategories('5', expandTorznabCategories([category]), sampleMappings), false);
      }
    });

    it('should match every standard mapping of a tracker category', () => {
      const mappings = [
        { cat: 'TV', id: 21 },
        { cat: 'Movies', id: 21 },
      ];
      assert.equal(matchesRequestedCategories('21', expandTorznabCategories([2000]), mappings), true);
      assert.equal(matchesRequestedCategories('21', expandTorznabCategories([5000]), mappings), true);
      assert.equal(matchesRequestedCategories('21', expandTorznabCategories([3000]), mappings), false);
    });

    it('should keep results in a requested category or beneath a requested parent', () => {
      const requested = expandTorznabCategories([5000]);
      assert.equal(matchesRequestedCategories(5, requested, sampleMappings), true);
      assert.equal(matchesRequestedCategories(1, requested, sampleMappings), false);
    });

    it('should keep unclassified results whatever the requested categories, as Jackett does', () => {
      for (const category of ['Sample Unmapped', undefined]) {
        for (const requested of [new Set([5000]), new Set([8000]), new Set<number>()]) {
          assert.equal(matchesRequestedCategories(category, requested, sampleMappings), true);
        }
      }
    });

    it('should leave an invalid mapping unclassified', () => {
      const mappings = [{ cat: 'Sample Unknown Category', id: 7 }];
      assert.deepEqual(trackerCatToTorznabIds(7, mappings), []);
      assert.deepEqual(torznabCatToTrackerIds([8000], mappings), []);
      assert.equal(matchesRequestedCategories(7, new Set([8000]), mappings), true);
      assert.equal(matchesRequestedCategories(7, new Set([5000]), mappings), true);
    });
  });

  describe('declared category bindings', () => {
    it('should hash string tracker IDs and share the ID across both translation directions', () => {
      const mappings = [{ cat: 'Movies', desc: 'Sample Section', id: 'sample-section' }];
      assert.deepEqual([...getSupportedCategoryIds(mappings)], [2000, 111064]);
      assert.deepEqual(torznabCatToTrackerIds([111064], mappings), ['sample-section']);
      assert.deepEqual(trackerCatToTorznabIds('SAMPLE-SECTION', mappings), [2000, 111064]);
      assert.deepEqual(getCategoryBindings(mappings).map(binding => binding.category), [
        { id: 2000, name: 'Movies' },
        { id: 111064, name: 'Sample Section' },
      ]);
      assert.equal(canHandleCategories([111064], mappings), true);
      assert.equal(canHandleCategories([111064], mappings, false), false);
    });

    it('should use signed integer parsing for custom IDs, hashing IDs outside its range', () => {
      const mappings = [
        { cat: 'Movies', desc: '', id: ' +42 ' },
        { cat: 'Movies', desc: 'Sample Large ID', id: '2147483648' },
        { cat: 'Movies', desc: 'Sample Maximum ID', id: '2147483647' },
      ];
      assert.deepEqual(getCategoryBindings(mappings).map(binding => binding.category.id), [2000, 100042, 2000, 134421, 2000, -2147383649]);
      assert.equal(canHandleCategories([100042], mappings), true);
    });

    it('should skip invalid category names even when a description is supplied', () => {
      const mappings = [{ cat: 'TV/Unknown', desc: 'Sample Invalid', id: 4 }];
      assert.deepEqual(getCategoryBindings(mappings), []);
      assert.equal(canHandleCategories([5000, 100004], mappings), false);
    });
  });

  describe('category admission', () => {
    it('should accept any advertised ID while leaving the requested IDs intact', () => {
      const requested = [9999, 5040, 5040];
      assert.equal(canHandleCategories(requested, sampleMappings), true);
      assert.deepEqual(requested, [9999, 5040, 5040]);
      assert.equal(canHandleCategories([], []), true);
      assert.equal(canHandleCategories([2000], []), false);
      assert.equal(canHandleCategories([9999], sampleMappings), false);
      assert.equal(canHandleCategories([6], sampleMappings), false);
    });

    it('should advertise parents and exclude tracker-specific IDs from aggregate caps', () => {
      const mappings = [{ cat: 'TV/HD', desc: 'Sample TV', id: 42 }];
      assert.deepEqual([...getSupportedCategoryIds(mappings)], [5000, 5040, 100042]);
      assert.equal(canHandleCategories([5000], mappings), true);
      assert.equal(canHandleCategories([5030], mappings), false);
      assert.equal(canHandleCategories([100042], mappings), true);
      assert.equal(canHandleCategories([100042], mappings, false), false);
      assert.equal(canHandleCategories([2000, 100042], mappings, false), false);
      assert.equal(canHandleCategories([5000, 100042], mappings, false), true);
    });

    it('should filter release categories by exact IDs without accepting raw forum IDs', () => {
      assert.equal(matchesRequestedCategories([5040, 100006], new Set([6]), sampleMappings), false);
      assert.equal(matchesRequestedCategories('6', new Set([6]), sampleMappings), false);
    });
  });

  describe('parseTorznabCategoryList', () => {
    it('should parse integers in order, skipping blank entries and preserving duplicates', () => {
      assert.deepEqual(parseTorznabCategoryList({ cat: ' 5000 ,,2000,5000' }), [5000, 2000, 5000]);
      assert.deepEqual(parseTorznabCategoryList({ cat: ',' }), []);
      assert.equal(parseTorznabCategoryList({ category: '5000' }), undefined);
    });

    it('should read only the first cat value, as Jackett binds a repeated parameter', () => {
      assert.deepEqual(parseTorznabCategoryList({ cat: ['2000', 'abc'] }), [2000]);
      assert.equal(parseTorznabCategoryList({ cat: ['abc', '2000'] }), null);
    });

    it('should return undefined when no categories are given or the value is only whitespace', () => {
      assert.equal(parseTorznabCategoryList({}), undefined);
      assert.equal(parseTorznabCategoryList({ cat: '' }), undefined);
      assert.equal(parseTorznabCategoryList({ cat: '  ' }), undefined);
      assert.equal(parseTorznabCategoryList({ cat: ['', '2000'] }), undefined);
    });

    it('should reject the list when an entry is not a 32-bit integer', () => {
      for (const sampleCat of ['abc', '5000,abc', '5000.5', '2147483648']) {
        assert.equal(parseTorznabCategoryList({ cat: sampleCat }), null, sampleCat);
      }
    });
  });
});
