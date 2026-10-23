// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { createHash } from 'node:crypto';

import { TrackerCategoryMapping } from '../../types/provider.js';
import { INT32_MAX, parseTorznabInteger } from '../query.js';
import { CUSTOM_CATEGORY_OFFSET, getParentCategoryId, getTorznabCategory, TORZNAB_CATEGORIES, TorznabCategory, torznabIdForName } from './catalog.js';

interface CategoryBinding {
  category: TorznabCategory;
  trackerId: number | string;
}

/**
 * Builds standard and custom category mappings from Cardigann declarations. Jackett adds a
 * custom category only for a supplied description and hashes nonnumeric tracker IDs with SHA-1.
 */
export function getCategoryBindings(mappings: TrackerCategoryMapping[]): CategoryBinding[] {
  const bindings: CategoryBinding[] = [];
  for (const mapping of mappings) {
    const standardId = torznabIdForName(mapping.cat);
    if (standardId === undefined) continue;
    bindings.push({ category: getTorznabCategory(standardId)!, trackerId: mapping.id });
    if (mapping.desc == null) continue;
    const rawId = String(mapping.id);
    const numericId = /^[+-]?\d+$/.test(rawId.trim()) ? Number(rawId) : NaN;
    const trackerId = Number.isInteger(numericId) && numericId >= -INT32_MAX - 1 && numericId <= INT32_MAX
      ? numericId
      : createHash('sha1').update(rawId).digest().readUInt16LE(0);
    bindings.push({ category: { id: (CUSTOM_CATEGORY_OFFSET + trackerId) | 0, name: mapping.desc }, trackerId: mapping.id });
  }
  return bindings;
}

/**
 * Expands requested Torznab ids the way Jackett does: a parent category also matches
 * all of its subcategories, while a subcategory matches only itself.
 */
export function expandTorznabCategories(ids: number[]): Set<number> {
  const expanded = new Set<number>();
  for (const id of ids) {
    expanded.add(id);
    if (id < CUSTOM_CATEGORY_OFFSET && id % 1000 === 0) {
      for (const cat of TORZNAB_CATEGORIES) {
        if (getParentCategoryId(cat.id) === id) {
          expanded.add(cat.id);
        }
      }
    }
  }
  return expanded;
}

/**
 * Parses the Torznab `cat` parameter as Jackett binds and parses it: only the first value is
 * read, blank entries are skipped, and every other entry must be a 32-bit integer. Returns
 * `undefined` when no categories are given or the value is only whitespace, and `null` when an
 * entry is not such an integer.
 */
export function parseTorznabCategoryList(query: Record<string, unknown>): number[] | null | undefined {
  const raw = Array.isArray(query.cat) ? query.cat[0] : query.cat;
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return undefined;
  }

  const categories: number[] = [];
  for (const part of splitCategoryValues(raw)) {
    const category = parseTorznabInteger(part);
    if (category === null) {
      return null;
    }
    if (category !== undefined) {
      categories.push(category);
    }
  }
  return categories;
}

function splitCategoryValues(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.flatMap(v => String(v).split(','))
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
}

export interface TorznabCategoryNode extends TorznabCategory {
  subcategories: TorznabCategory[];
}

/**
 * Builds Jackett's category tree, retaining the first label for each category ID.
 */
export function getTorznabCategoryTree(
  mappings: TrackerCategoryMapping[],
  shouldIncludeTrackerCategories = true
): TorznabCategoryNode[] {
  const tree = new Map<number, TorznabCategoryNode>();
  for (const { category } of getCategoryBindings(mappings)) {
    if (!shouldIncludeTrackerCategories && category.id >= CUSTOM_CATEGORY_OFFSET) continue;
    const parentId = getTorznabCategory(category.id) !== undefined && category.id % 1000 !== 0
      ? getParentCategoryId(category.id)
      : undefined;
    if (parentId !== undefined) {
      const parent = tree.get(parentId) ?? { ...getTorznabCategory(parentId)!, subcategories: [] };
      if (!parent.subcategories.some(child => child.id === category.id)) parent.subcategories.push({ ...category });
      tree.set(parentId, parent);
    } else if (!tree.has(category.id)) {
      tree.set(category.id, { ...category, subcategories: [] });
    }
  }
  return [...tree.values()];
}

/**
 * Category IDs advertised in caps, including parents of mapped subcategories. Aggregate caps
 * exclude IDs at or above the tracker-specific category offset.
 */
export function getSupportedCategoryIds(
  mappings: TrackerCategoryMapping[],
  shouldIncludeTrackerCategories = true
): Set<number> {
  return new Set(getTorznabCategoryTree(mappings, shouldIncludeTrackerCategories)
    .flatMap(category => [category.id, ...category.subcategories.map(child => child.id)]));
}

/**
 * Admits an unfiltered request or one containing at least one ID advertised in the caps.
 * Unsupported IDs stay in the request, as Jackett's category admission does not rewrite it.
 */
export function canHandleCategories(
  requested: number[],
  mappings: TrackerCategoryMapping[],
  shouldIncludeTrackerCategories = true
): boolean {
  if (requested.length === 0) return true;
  const supported = getSupportedCategoryIds(mappings, shouldIncludeTrackerCategories);
  return requested.some(id => supported.has(id));
}

/**
 * Maps requested Torznab category IDs to tracker categories, expanding parent categories.
 */
export function torznabCatToTrackerIds(
  catQueries: number[],
  mappings: TrackerCategoryMapping[]
): Array<number | string> {
  const expanded = expandTorznabCategories(catQueries);
  const trackerIds = new Map<string, number | string>();
  for (const { category, trackerId } of getCategoryBindings(mappings)) {
    if (expanded.has(category.id)) trackerIds.set(String(trackerId), trackerId);
  }
  return [...trackerIds.values()];
}

/**
 * Maps a tracker's category to its declared standard and tracker-specific Torznab IDs.
 * Returns an empty list for an unmapped or missing category.
 */
export function trackerCatToTorznabIds(
  trackerCat: number | string | undefined,
  mappings: TrackerCategoryMapping[]
): number[] {
  const mapping = findTrackerMapping(trackerCat, mappings);
  if (!mapping) {
    return [];
  }

  return [...new Set(getCategoryBindings(mappings)
    .filter(binding => String(binding.trackerId).toLowerCase() === String(mapping.id).toLowerCase())
    .map(binding => binding.category.id))];
}

/**
 * Returns whether a result belongs to any of the requested Torznab categories. As in Jackett,
 * a result with no mapped category is kept, since it has no category to rule it out.
 */
export function matchesRequestedCategories(
  trackerCat: number | number[] | string | undefined,
  requested: Set<number>,
  mappings: TrackerCategoryMapping[]
): boolean {
  if (Array.isArray(trackerCat)) {
    return requested.size === 0 || trackerCat.length === 0 || trackerCat.some(id => requested.has(id));
  }
  const mapping = findTrackerMapping(trackerCat, mappings);
  if (requested.size === 0) {
    return true;
  }
  if (!mapping) {
    return true;
  }
  const catIds = trackerCatToTorznabIds(mapping.id, mappings);
  return catIds.length === 0 || catIds.some(id => requested.has(id));
}

function findTrackerMapping(
  trackerCat: number | string | undefined,
  mappings: TrackerCategoryMapping[]
): TrackerCategoryMapping | undefined {
  if (trackerCat === undefined || trackerCat === null || String(trackerCat).trim() === '') {
    return undefined;
  }

  const key = String(trackerCat).toLowerCase();
  return mappings.find(mapping => String(mapping.id).toLowerCase() === key);
}
