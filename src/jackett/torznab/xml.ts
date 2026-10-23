// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { getReleaseGuid } from '../../search/result-identity.js';
import { TrackerCategoryMapping } from '../../types/provider.js';
import { TorrentItem } from '../../types/torrent.js';
import { parseToUtcString } from '../../utils/date.js';
import { getMagnetInfoHash } from '../../utils/magnet.js';
import { trackerCatToTorznabIds } from '../categories/mapping.js';

/**
 * Characters XML 1.0 does not allow anywhere in a document, even escaped.
 */
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/**
 * Error codes defined by the Torznab/Newznab API specification.
 */
export const TORZNAB_ERROR_CODES = {
  functionNotAvailable: 203,
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
  mappings: TrackerCategoryMapping[];
  trackerId: string;
  trackerName: string;
  trackerType: string;
}

/**
 * Channel-level settings for a Torznab feed.
 */
export interface TorznabFeedOptions {
  apiKey?: string;
  /** The indexer's description, as Jackett's channel describes the feed. */
  channelDescription?: string;
  /** The indexer's site link. */
  channelLink: string;
  /** The indexer's name. */
  channelTitle: string;
  /** Server origin, linked as the feed's atom self link and used for download links. */
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
 * Serializes torrent results into Torznab RSS 2.0 XML in the element order and layout of
 * Jackett's `ResultPage`.
 */
export function renderTorznabFeed(entries: TorznabFeedEntry[], options: TorznabFeedOptions): string {
  const origin = options.origin ?? '';
  const apiKeyParam = options.apiKey ? `&jackett_apikey=${encodeURIComponent(options.apiKey)}` : '';

  const itemElements = entries.map(({ item, mappings, trackerId, trackerName, trackerType }) => {
    const downloadPath = `/api/v2.0/indexers/${trackerId}/download?url=${encodeURIComponent(item.torrentUrl)}${apiKeyParam}`;
    const link = item.torrentUrl ? `${origin}${downloadPath}` : item.magnetUri ?? '';
    const infoHash = item.infoHash?.trim() ? item.infoHash : getMagnetInfoHash(item.magnetUri);
    const catIds = item.categories ?? trackerCatToTorznabIds(item.category, mappings);
    const sizeLength = item.sizeBytes === undefined ? '' : ` length="${item.sizeBytes}"`;
    const elements = [
      `<title>${escapeXml(item.name)}</title>`,
      `<guid>${escapeXml(getReleaseGuid(item))}</guid>`,
      `<jackettindexer id="${escapeXml(trackerId)}">${escapeXml(trackerName)}</jackettindexer>`,
      `<type>${escapeXml(trackerType)}</type>`,
      item.url ? `<comments>${escapeXml(item.url)}</comments>` : undefined,
      `<pubDate>${formatTorznabDate(item.date)}</pubDate>`,
      item.sizeBytes === undefined ? undefined : `<size>${item.sizeBytes}</size>`,
      item.files === undefined ? undefined : `<files>${item.files}</files>`,
      item.downloadCount === undefined ? undefined : `<grabs>${item.downloadCount}</grabs>`,
      item.description === undefined ? '<description />' : `<description>${escapeXml(item.description)}</description>`,
      `<link>${escapeXml(link)}</link>`,
      ...catIds.map(id => `<category>${id}</category>`),
      `<enclosure url="${escapeXml(link)}"${sizeLength} type="application/x-bittorrent" />`,
      ...catIds.map(id => renderTorznabAttr('category', id)),
      renderTorznabAttr('rageid', item.rageId),
      renderTorznabAttr('tvdbid', item.tvdbId),
      renderTorznabAttr('imdb', item.imdbId?.slice(2)),
      renderTorznabAttr('imdbid', item.imdbId),
      renderTorznabAttr('tmdbid', item.tmdbId),
      renderTorznabAttr('tvmazeid', item.tvmazeId),
      renderTorznabAttr('traktid', item.traktId),
      renderTorznabAttr('doubanid', item.doubanId),
      renderTorznabAttr('genre', item.genres?.join(', ')),
      renderTorznabAttr('year', item.year),
      renderTorznabAttr('author', item.author),
      renderTorznabAttr('booktitle', item.bookTitle),
      renderTorznabAttr('publisher', item.publisher),
      renderTorznabAttr('artist', item.artist),
      renderTorznabAttr('album', item.album),
      renderTorznabAttr('label', item.label),
      renderTorznabAttr('track', item.track),
      renderTorznabAttr('seeders', item.seeders),
      renderTorznabAttr('peers', item.seeders === undefined && item.leechers === undefined ? undefined : (item.seeders ?? 0) + (item.leechers ?? 0)),
      renderTorznabAttr('infohash', infoHash),
      renderTorznabAttr('magneturl', item.magnetUri),
      renderTorznabAttr('minimumratio', item.minimumRatio),
      renderTorznabAttr('minimumseedtime', item.minimumSeedTimeSeconds),
      renderTorznabAttr('downloadvolumefactor', item.downloadVolumeFactor),
      renderTorznabAttr('uploadvolumefactor', item.uploadVolumeFactor),
    ].filter(element => element !== undefined);
    return `    <item>\n${elements.map(element => `      ${element}`).join('\n')}\n    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <atom:link href="${escapeXml(`${origin}/`)}" rel="self" type="application/rss+xml" />
    <title>${escapeXml(options.channelTitle)}</title>
    ${options.channelDescription === undefined ? '<description />' : `<description>${escapeXml(options.channelDescription)}</description>`}
    <link>${escapeXml(options.channelLink)}</link>
    <language>en-US</language>
    <category>search</category>
${itemElements.join('\n')}
  </channel>
</rss>`;
}

/**
 * Renders a `torznab:attr` element, or nothing when the value is absent.
 */
function renderTorznabAttr(name: string, value: number | string | undefined): string | undefined {
  return value === undefined ? undefined : `<torznab:attr name="${name}" value="${escapeXml(String(value))}" />`;
}

/**
 * Formats a publish date as Jackett's feeds do, `ddd, dd MMM yyyy HH:mm:ss` and a numeric offset,
 * here always UTC.
 */
function formatTorznabDate(date: string): string {
  return parseToUtcString(date).replace(/ GMT$/, ' +0000');
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
