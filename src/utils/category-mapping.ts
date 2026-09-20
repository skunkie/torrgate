// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { CardigannCategoryMapping } from '../providers/types.js';

/**
 * A standard Torznab (Newznab) category.
 */
export interface TorznabCategory {
  id: number;
  name: string;
}

/**
 * Offset added to a tracker's own category id to form its tracker-specific Torznab id,
 * keeping it clear of the 1000–8999 range reserved for standard categories.
 */
export const CUSTOM_CATEGORY_OFFSET = 100000;

/**
 * Default category for results whose tracker category has no mapping.
 */
export const OTHER_CATEGORY_ID = 8000;

/**
 * The standard Torznab category tree. Parents are multiples of 1000; every other id
 * is a subcategory of the parent with the same thousands digit.
 */
export const TORZNAB_CATEGORIES: readonly TorznabCategory[] = [
  { id: 1000, name: 'Console' },
  { id: 1010, name: 'Console/NDS' },
  { id: 1020, name: 'Console/PSP' },
  { id: 1030, name: 'Console/Wii' },
  { id: 1040, name: 'Console/XBox' },
  { id: 1050, name: 'Console/XBox 360' },
  { id: 1060, name: 'Console/Wiiware' },
  { id: 1070, name: 'Console/XBox 360 DLC' },
  { id: 1080, name: 'Console/PS3' },
  { id: 1090, name: 'Console/Other' },
  { id: 1110, name: 'Console/3DS' },
  { id: 1120, name: 'Console/PS Vita' },
  { id: 1130, name: 'Console/WiiU' },
  { id: 1140, name: 'Console/XBox One' },
  { id: 1180, name: 'Console/PS4' },
  { id: 2000, name: 'Movies' },
  { id: 2010, name: 'Movies/Foreign' },
  { id: 2020, name: 'Movies/Other' },
  { id: 2030, name: 'Movies/SD' },
  { id: 2040, name: 'Movies/HD' },
  { id: 2045, name: 'Movies/UHD' },
  { id: 2050, name: 'Movies/BluRay' },
  { id: 2060, name: 'Movies/3D' },
  { id: 2070, name: 'Movies/DVD' },
  { id: 2080, name: 'Movies/WEB-DL' },
  { id: 3000, name: 'Audio' },
  { id: 3010, name: 'Audio/MP3' },
  { id: 3020, name: 'Audio/Video' },
  { id: 3030, name: 'Audio/Audiobook' },
  { id: 3040, name: 'Audio/Lossless' },
  { id: 3050, name: 'Audio/Other' },
  { id: 3060, name: 'Audio/Foreign' },
  { id: 4000, name: 'PC' },
  { id: 4010, name: 'PC/0day' },
  { id: 4020, name: 'PC/ISO' },
  { id: 4030, name: 'PC/Mac' },
  { id: 4040, name: 'PC/Mobile-Other' },
  { id: 4050, name: 'PC/Games' },
  { id: 4060, name: 'PC/Mobile-iOS' },
  { id: 4070, name: 'PC/Mobile-Android' },
  { id: 5000, name: 'TV' },
  { id: 5010, name: 'TV/WEB-DL' },
  { id: 5020, name: 'TV/Foreign' },
  { id: 5030, name: 'TV/SD' },
  { id: 5040, name: 'TV/HD' },
  { id: 5045, name: 'TV/UHD' },
  { id: 5050, name: 'TV/Other' },
  { id: 5060, name: 'TV/Sport' },
  { id: 5070, name: 'TV/Anime' },
  { id: 5080, name: 'TV/Documentary' },
  { id: 6000, name: 'XXX' },
  { id: 6010, name: 'XXX/DVD' },
  { id: 6020, name: 'XXX/WMV' },
  { id: 6030, name: 'XXX/XviD' },
  { id: 6040, name: 'XXX/x264' },
  { id: 6045, name: 'XXX/UHD' },
  { id: 6050, name: 'XXX/Pack' },
  { id: 6060, name: 'XXX/ImageSet' },
  { id: 6070, name: 'XXX/Other' },
  { id: 6080, name: 'XXX/SD' },
  { id: 6090, name: 'XXX/WEB-DL' },
  { id: 7000, name: 'Books' },
  { id: 7010, name: 'Books/Mags' },
  { id: 7020, name: 'Books/EBook' },
  { id: 7030, name: 'Books/Comics' },
  { id: 7040, name: 'Books/Technical' },
  { id: 7050, name: 'Books/Other' },
  { id: 7060, name: 'Books/Foreign' },
  { id: 8000, name: 'Other' },
  { id: 8010, name: 'Other/Misc' },
  { id: 8020, name: 'Other/Hashed' },
];

const CATEGORY_ID_BY_NAME = new Map(TORZNAB_CATEGORIES.map(cat => [cat.name.toLowerCase(), cat.id]));
const CATEGORY_BY_ID = new Map(TORZNAB_CATEGORIES.map(cat => [cat.id, cat]));

/**
 * Returns the standard category for an id, if it is one.
 */
export function getTorznabCategory(id: number): TorznabCategory | undefined {
  return CATEGORY_BY_ID.get(id);
}

/**
 * Returns the parent id of a standard category (5040 → 5000).
 */
export function getParentCategoryId(id: number): number {
  return Math.floor(id / 1000) * 1000;
}

/**
 * Resolves a Cardigann `cat` name such as `TV/Anime` to its standard Torznab id, falling back
 * to the parent (`TV`) for an unknown subcategory. Returns `undefined` for unknown names.
 */
export function torznabIdForName(name: string): number | undefined {
  const lower = name.trim().toLowerCase();
  const exact = CATEGORY_ID_BY_NAME.get(lower);
  if (exact !== undefined) {
    return exact;
  }
  const slashIdx = lower.indexOf('/');
  return slashIdx > 0 ? CATEGORY_ID_BY_NAME.get(lower.slice(0, slashIdx)) : undefined;
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
 * Parses a list of category numbers from query parameters.
 */
export function parseCategoryList(query: Record<string, unknown>): number[] {
  const raw =
    query['Category[]'] ??
    query['category[]'] ??
    query.Category ??
    query.category ??
    query.cat;

  const parts = Array.isArray(raw)
    ? raw.flatMap(v => String(v).split(','))
    : typeof raw === 'string'
      ? raw.split(',')
      : [];

  return [...new Set(parts.map(part => parseInt(part.trim(), 10)).filter(n => !Number.isNaN(n)))];
}

/**
 * Maps requested Torznab categories (standard ids, tracker-specific `100000 + id` ids, or
 * category names such as `TV`) to the tracker's own category ids.
 *
 * A number that is neither a standard nor a tracker-specific id is accepted as a tracker
 * category id when the definition has one with that id.
 */
export function torznabCatToTrackerIds(
  catQueries: Array<number | string>,
  mappings: CardigannCategoryMapping[]
): Array<number | string> {
  const requestedIds: number[] = [];
  const directIds = new Set<string>();

  for (const query of catQueries) {
    const numeric = typeof query === 'number' ? query : Number(query);
    if (Number.isInteger(numeric) && String(query).trim() !== '') {
      if (numeric >= CUSTOM_CATEGORY_OFFSET || CATEGORY_BY_ID.has(numeric)) {
        requestedIds.push(numeric);
      } else {
        directIds.add(String(numeric));
      }
      continue;
    }

    const byName = torznabIdForName(String(query));
    if (byName !== undefined) {
      requestedIds.push(byName);
    }
  }

  const expanded = expandTorznabCategories(requestedIds);
  const trackerIds = new Map<string, number | string>();

  for (const mapping of mappings) {
    const key = String(mapping.id);
    const standardId = torznabIdForName(mapping.cat);
    const customId = CUSTOM_CATEGORY_OFFSET + Number(mapping.id);
    if (
      (standardId !== undefined && expanded.has(standardId)) ||
      expanded.has(customId) ||
      directIds.has(key)
    ) {
      trackerIds.set(key, mapping.id);
    }
  }

  return [...trackerIds.values()];
}

/**
 * Maps a tracker's category (id or description) to its Torznab categories: the standard id
 * first, then the tracker-specific `100000 + id` when the tracker id is numeric.
 * Unmapped categories are reported as Other (8000).
 */
export function trackerCatToTorznab(
  trackerCat: number | string | undefined,
  mappings: CardigannCategoryMapping[]
): { catDesc: string; catIds: number[] } {
  const mapping = findTrackerMapping(trackerCat, mappings);
  if (!mapping) {
    const desc = typeof trackerCat === 'string' && trackerCat.trim() ? trackerCat : 'Other';
    return { catDesc: desc, catIds: [OTHER_CATEGORY_ID] };
  }

  const catIds = [torznabIdForName(mapping.cat) ?? OTHER_CATEGORY_ID];
  const numericId = Number(mapping.id);
  if (Number.isInteger(numericId) && String(mapping.id).trim() !== '') {
    catIds.push(CUSTOM_CATEGORY_OFFSET + numericId);
  }

  return { catDesc: mapping.desc || mapping.cat, catIds };
}

/**
 * Returns whether a result belongs to any of the requested Torznab categories.
 * Results with no mapped category are kept, since they cannot be classified.
 */
export function matchesRequestedCategories(
  trackerCat: number | string | undefined,
  requested: Set<number>,
  mappings: CardigannCategoryMapping[]
): boolean {
  if (requested.size === 0 || !findTrackerMapping(trackerCat, mappings)) {
    return true;
  }
  return trackerCatToTorznab(trackerCat, mappings).catIds.some(id => requested.has(id));
}

function findTrackerMapping(
  trackerCat: number | string | undefined,
  mappings: CardigannCategoryMapping[]
): CardigannCategoryMapping | undefined {
  if (trackerCat === undefined || trackerCat === null || String(trackerCat).trim() === '') {
    return undefined;
  }

  const key = String(trackerCat).trim();
  const byId = mappings.find(m => String(m.id) === key);
  if (byId) {
    return byId;
  }

  const lower = key.toLowerCase();
  return mappings.find(m => m.desc?.toLowerCase() === lower || m.cat.toLowerCase() === lower);
}
