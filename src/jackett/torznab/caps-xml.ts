// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { TrackerCategoryMapping } from '../../types/provider.js';
import { CUSTOM_CATEGORY_OFFSET } from '../categories/catalog.js';
import { getTorznabCategoryTree } from '../categories/mapping.js';
import { BASIC_SEARCH_CAPS, getSupportedSearchParameters, isSearchModeAvailable, TORZNAB_CAPS_LIMIT, TorznabSearchCaps, TorznabSearchMode } from './caps.js';
import { escapeXml } from './xml.js';

/**
 * Options for {@link renderTorznabCaps}.
 */
export interface TorznabCapsOptions {
  /** Result count advertised as the default and maximum limit; defaults to 100. */
  resultLimit?: number;
  /** The indexer's search capabilities; without them only basic search is available. */
  searchCaps?: TorznabSearchCaps;
  shouldIncludeTrackerCategories?: boolean;
}

/**
 * Serializes standard Torznab caps XML (<caps>).
 *
 * Lists the standard categories the mappings use, nesting subcategories under their parent.
 * With `shouldIncludeTrackerCategories`, described mappings also expose their tracker-specific IDs.
 */
export function renderTorznabCaps(
  mappings: TrackerCategoryMapping[],
  options: TorznabCapsOptions = {}
): string {
  const resultLimit = options.resultLimit ?? TORZNAB_CAPS_LIMIT;
  const searchCaps = options.searchCaps ?? BASIC_SEARCH_CAPS;
  const searchEngine = searchCaps.supportsRawSearch ? ' searchEngine="raw"' : '';
  const renderSearchMode = (element: string, mode: TorznabSearchMode): string => {
    const available = isSearchModeAvailable(searchCaps, mode) ? 'yes' : 'no';
    const supportedParams = getSupportedSearchParameters(searchCaps, mode).join(',');
    return `    <${element} available="${available}" supportedParams="${supportedParams}"${searchEngine} />`;
  };

  const sortKey = (category: { id: number; name: string }): string =>
    category.id >= CUSTOM_CATEGORY_OFFSET ? `zzz${category.name}` : String(category.id);
  const categories = getTorznabCategoryTree(mappings, options.shouldIncludeTrackerCategories ?? false)
    .sort((first, second) => sortKey(first).localeCompare(sortKey(second), 'en'));
  const categoryElements = categories.map(category => {
    const opening = `    <category id="${category.id}" name="${escapeXml(category.name)}"`;
    if (category.subcategories.length === 0) return `${opening} />`;
    const subcategories = [...category.subcategories].sort((first, second) => first.id - second.id);
    const elements = subcategories.map(child => `      <subcat id="${child.id}" name="${escapeXml(child.name)}" />`);
    return `${opening}>\n${elements.join('\n')}\n    </category>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server title="TorrGate" />
  <limits default="${resultLimit}" max="${resultLimit}" />
  <searching>
${renderSearchMode('search', 'search')}
${renderSearchMode('tv-search', 'tv-search')}
${renderSearchMode('movie-search', 'movie-search')}
${renderSearchMode('music-search', 'music-search')}
${renderSearchMode('audio-search', 'music-search')}
${renderSearchMode('book-search', 'book-search')}
  </searching>
${categoryElements.length === 0 ? '  <categories />' : `  <categories>\n${categoryElements.join('\n')}\n  </categories>`}
</caps>`;
}
