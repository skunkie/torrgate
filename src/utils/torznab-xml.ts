// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { CardigannCategoryMapping } from '../providers/types.js';
import { TorrentItem } from '../types/torrent.js';
import {
  CUSTOM_CATEGORY_OFFSET,
  getParentCategoryId,
  TORZNAB_CATEGORIES,
  torznabIdForName,
  trackerCatToTorznab,
} from './category-mapping.js';
import { parseToUtcString } from './date.js';
import { extractInfoHash } from './magnet.js';

/**
 * Characters XML 1.0 does not allow anywhere in a document, even escaped.
 */
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/**
 * Error codes defined by the Torznab/Newznab API specification.
 */
export const TORZNAB_ERROR_CODES = {
  incorrectCredentials: 100,
  incorrectParameter: 201,
  requestLimitReached: 500,
  unknownError: 900,
} as const;

/**
 * A Torznab error code.
 */
export type TorznabErrorCode = (typeof TORZNAB_ERROR_CODES)[keyof typeof TORZNAB_ERROR_CODES];

/**
 * One result in a Torznab feed, together with the indexer it came from.
 */
export interface TorznabFeedEntry {
  item: TorrentItem;
  mappings: CardigannCategoryMapping[];
  trackerId: string;
  trackerName: string;
  trackerType: string;
}

/**
 * Channel-level settings for a Torznab feed.
 */
export interface TorznabFeedOptions {
  apiKey?: string;
  /** Indexer id in the feed's own URL (`all` for the aggregated feed). */
  channelId: string;
  channelTitle: string;
  origin?: string;
}

/**
 * Escapes special XML characters and removes characters XML 1.0 cannot represent,
 * so one malformed scraped title cannot invalidate the whole document.
 */
export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Serializes standard Torznab caps XML (<caps>).
 *
 * Lists the standard categories the mappings use, nesting subcategories under their parent.
 * With `includeTrackerCategories`, each tracker category is also listed under its
 * tracker-specific id (`100000 + id`) so clients can request it exactly.
 */
export function renderTorznabCaps(
  mappings: CardigannCategoryMapping[],
  options: { includeTrackerCategories?: boolean } = {}
): string {
  const usedIds = new Set<number>();
  for (const mapping of mappings) {
    const id = torznabIdForName(mapping.cat);
    if (id !== undefined) {
      usedIds.add(id);
      usedIds.add(getParentCategoryId(id));
    }
  }

  const parents = TORZNAB_CATEGORIES.filter(
    cat => cat.id % 1000 === 0 && (usedIds.size === 0 || usedIds.has(cat.id))
  );

  const categoryElements = parents.map(parent => {
    const subcats = TORZNAB_CATEGORIES.filter(
      cat => cat.id !== parent.id && getParentCategoryId(cat.id) === parent.id && usedIds.has(cat.id)
    );
    if (subcats.length === 0) {
      return `    <category id="${parent.id}" name="${escapeXml(parent.name)}" />`;
    }
    const subcatElements = subcats.map(
      sub => `      <subcat id="${sub.id}" name="${escapeXml(sub.name)}" />`
    );
    return `    <category id="${parent.id}" name="${escapeXml(parent.name)}">\n${subcatElements.join('\n')}\n    </category>`;
  });

  if (options.includeTrackerCategories) {
    const seen = new Set<number>();
    for (const mapping of mappings) {
      const trackerId = Number(mapping.id);
      if (!Number.isInteger(trackerId) || String(mapping.id).trim() === '') continue;
      const customId = CUSTOM_CATEGORY_OFFSET + trackerId;
      if (seen.has(customId)) continue;
      seen.add(customId);
      categoryElements.push(
        `    <category id="${customId}" name="${escapeXml((mapping.desc || mapping.cat).trim())}" />`
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server version="1.0" title="TorrGate" />
  <searching>
    <search available="yes" supportedParams="q" />
    <tv-search available="yes" supportedParams="q,season,ep" />
    <movie-search available="yes" supportedParams="q" />
  </searching>
  <categories>
${categoryElements.join('\n')}
  </categories>
</caps>`;
}

/**
 * Serializes torrent results into Torznab RSS 2.0 XML with torznab attributes.
 */
export function renderTorznabFeed(entries: TorznabFeedEntry[], options: TorznabFeedOptions): string {
  const origin = options.origin ?? '';
  const channelLink = origin
    ? `${origin}/api/v2.0/indexers/${options.channelId}/results/torznab/api`
    : 'https://github.com/torrplay/torrgate';
  const apiKeyParam = options.apiKey ? `&jackett_apikey=${encodeURIComponent(options.apiKey)}` : '';

  const itemElements = entries.map(({ item, mappings, trackerId, trackerName, trackerType }) => {
    const guid = escapeXml(item.url || item.torrentUrl || item.id);
    const downloadPath = `/api/v2.0/indexers/${trackerId}/download?url=${encodeURIComponent(item.torrentUrl)}${apiKeyParam}`;
    const fullLink = item.torrentUrl
      ? (origin ? `${origin}${downloadPath}` : downloadPath)
      : item.url;
    const size = item.sizeBytes ?? 0;
    const peers = item.seeders + item.leechers;
    const infoHash = extractInfoHash(item.magnetUri);
    const { catDesc, catIds } = trackerCatToTorznab(item.category, mappings);

    const enclosureUrl = fullLink || item.magnetUri || '';
    const enclosureTag = enclosureUrl
      ? `\n      <enclosure url="${escapeXml(enclosureUrl)}" length="${size}" type="application/x-bittorrent" />`
      : '';
    const categoryAttrs = catIds
      .map(id => `\n      <torznab:attr name="category" value="${id}" />`)
      .join('');
    const magnetAttr = item.magnetUri
      ? `\n      <torznab:attr name="magneturl" value="${escapeXml(item.magnetUri)}" />`
      : '';
    const infoHashAttr = infoHash
      ? `\n      <torznab:attr name="infohash" value="${escapeXml(infoHash)}" />`
      : '';

    return `    <item>
      <title>${escapeXml(item.name)}</title>
      <guid>${guid}</guid>
      <jackettindexer id="${escapeXml(trackerId)}">${escapeXml(trackerName)}</jackettindexer>
      <type>${escapeXml(trackerType)}</type>
      <comments>${escapeXml(item.url)}</comments>
      <pubDate>${parseToUtcString(item.date)}</pubDate>
      <size>${size}</size>
      <description />
      <link>${escapeXml(fullLink)}</link>
      <category>${escapeXml(catDesc)}</category>${enclosureTag}${categoryAttrs}
      <torznab:attr name="seeders" value="${item.seeders}" />
      <torznab:attr name="peers" value="${peers}" />${magnetAttr}${infoHashAttr}
      <torznab:attr name="downloadvolumefactor" value="${trackerType === 'private' ? '1' : '0'}" />
      <torznab:attr name="uploadvolumefactor" value="1" />
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>${escapeXml(options.channelTitle)}</title>
    <description>TorrGate Torznab Feed for ${escapeXml(options.channelId)}</description>
    <link>${escapeXml(channelLink)}</link>
${itemElements.join('\n')}
  </channel>
</rss>`;
}

/**
 * Serializes a Torznab `<error>` document.
 */
export function renderTorznabError(code: TorznabErrorCode, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<error code="${code}" description="${escapeXml(description)}" />`;
}

/**
 * Returns whether a request path addresses a Torznab endpoint, whose clients expect errors
 * as Torznab XML rather than JSON.
 */
export function isTorznabPath(path: string): boolean {
  return /\/results\/torznab(?:\/api)?\/?$/.test(path);
}

