// SPDX-FileCopyrightText: 2026 TorrPlay
//
// SPDX-License-Identifier: MIT

import { InfoHash } from '../types/torrent.js';

/**
 * Constructs a magnet URI for an info hash with optional announce trackers and display name.
 */
export function buildMagnetUri(
  infoHash: InfoHash,
  trackers?: string[],
  displayName?: string
): string {
  const cleanHash = infoHash.replace(/^magnet:\?xt=urn:btih:/i, '').replace(/&.*$/, '').trim();
  let magnetUri = `magnet:?xt=urn:btih:${cleanHash}`;

  if (displayName) {
    magnetUri += `&dn=${encodeURIComponent(displayName)}`;
  }

  if (trackers && trackers.length > 0) {
    for (const tracker of trackers) {
      magnetUri += `&tr=${encodeURIComponent(tracker)}`;
    }
  }

  return magnetUri;
}

/**
 * Extracts and normalizes the BitTorrent info hash (hex or base32) from a magnet URI or bare hash.
 * Returns an uppercase string or null if not found.
 */
export function extractInfoHash(magnetUriOrHash?: string): InfoHash | null {
  if (!magnetUriOrHash || typeof magnetUriOrHash !== 'string') {
    return null;
  }

  const trimmed = magnetUriOrHash.trim();
  if (!trimmed) {
    return null;
  }

  // Check for xt=urn:btih: in magnet URI
  const match = trimmed.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  if (match) {
    return match[1].toUpperCase();
  }

  // Check for bare 40-char hex or 32-char base32 info hash
  if (/^[a-fA-F0-9]{40}$/.test(trimmed) || /^[a-zA-Z2-7]{32}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return null;
}
