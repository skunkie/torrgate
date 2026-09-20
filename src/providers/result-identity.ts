// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { TorrentItem } from '../types/torrent.js';
import { extractInfoHash } from '../utils/magnet.js';

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
