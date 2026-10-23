// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { TorrentItem } from '../types/torrent.js';
import { extractInfoHash } from '../utils/magnet.js';

/**
 * Returns a result's release GUID as Jackett assigns it: the download link, else the magnet URI,
 * else the details URL. Torznab `<guid>` and JSON `Guid` carry it.
 */
export function getReleaseGuid(item: TorrentItem): string {
  return item.torrentUrl || item.magnetUri || item.url || item.id;
}

/**
 * Keeps the first of an indexer's results for each release GUID, as Jackett deduplicates every
 * indexer's results before they reach a JSON or Torznab response.
 */
export function dedupeByReleaseGuid(items: TorrentItem[]): TorrentItem[] {
  const seenGuids = new Set<string>();
  return items.filter(item => {
    const guid = getReleaseGuid(item);
    if (seenGuids.has(guid)) return false;
    seenGuids.add(guid);
    return true;
  });
}

/**
 * Returns the most stable available identity for a torrent result.
 */
export function getTorrentResultIdentity(item: TorrentItem): string {
  const detailsUrl = item.url.trim();
  if (detailsUrl) {
    return `details:${detailsUrl}`;
  }

  const torrentUrl = item.torrentUrl.trim();
  if (torrentUrl) {
    return `torrent:${torrentUrl}`;
  }

  const infoHash = extractInfoHash(item.infoHash) ?? extractInfoHash(item.magnetUri);
  if (infoHash) {
    return `infohash:${infoHash}`;
  }

  const magnetUri = item.magnetUri?.trim();
  if (magnetUri) {
    return `magnet:${magnetUri}`;
  }

  return `id:${item.id}\nname:${item.name}`;
}
