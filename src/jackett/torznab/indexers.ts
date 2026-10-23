// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { TrackerCategoryMapping } from '../../types/provider.js';
import { TorznabSearchCaps } from './caps.js';
import { renderTorznabCaps } from './caps-xml.js';
import { escapeXml } from './xml.js';

/**
 * Indexer metadata and capabilities returned by the aggregate indexer's discovery request.
 */
export interface TorznabIndexerEntry {
  description?: string;
  id: string;
  isConfigured: boolean;
  language?: string;
  link: string;
  mappings: TrackerCategoryMapping[];
  searchCaps?: TorznabSearchCaps;
  title: string;
  type: string;
}

/**
 * Renders Jackett's indexer discovery document, embedding each indexer's caps.
 */
export function renderTorznabIndexers(indexers: TorznabIndexerEntry[]): string {
  const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
  if (indexers.length === 0) return `${declaration}\n<indexers />`;
  const elements = indexers.map(indexer => {
    const element = (name: string, value: string | undefined): string =>
      value === undefined ? `    <${name} />` : `    <${name}>${escapeXml(value)}</${name}>`;
    const caps = renderTorznabCaps(indexer.mappings, { searchCaps: indexer.searchCaps, shouldIncludeTrackerCategories: true });
    return [
      `  <indexer id="${escapeXml(indexer.id)}" configured="${indexer.isConfigured}">`,
      element('title', indexer.title),
      element('description', indexer.description),
      element('link', indexer.link),
      element('language', indexer.language),
      element('type', indexer.type),
      ...caps.slice(caps.indexOf('<caps>')).split('\n').map(line => `    ${line}`),
      '  </indexer>',
    ].join('\n');
  });
  return `${declaration}\n<indexers>\n${elements.join('\n')}\n</indexers>`;
}
